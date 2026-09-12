const { Op, fn, col, literal, QueryTypes } = require("sequelize");
const { Bill, Payment, Vendor, sequelize } = require("../../models");

// Formats a Date as YYYY-MM-DD in a given IANA timezone. Using the vendor's
// own timezone (not the app server's) matters because the two can differ --
// a server running in UTC must still bucket "today" the way a Kerala
// restaurant sees it, not the way the server's clock does.
function dateKeyInTz(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date
  );
}

async function getSummary(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.vendorId);
    const timeZone = vendor.timezone || "UTC";

    const days = Math.min(Number(req.query.days) || 7, 30);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const billWhere = {
      vendorId: req.vendorId,
      status: { [Op.ne]: "void" },
      generatedAt: { [Op.gte]: since },
      ...(req.branchId && { branchId: req.branchId }),
    };

    // Bucket by calendar day in the vendor's timezone, not the DB server's.
    const dayExpr = fn("DATE", fn("timezone", timeZone, col("generated_at")));

    const dailyRows = await Bill.findAll({
      where: billWhere,
      attributes: [
        [dayExpr, "date"],
        [fn("SUM", col("total_amount")), "sales"],
        [fn("COUNT", col("id")), "orders"],
      ],
      group: [literal("1")],
      raw: true,
    });
    const dailyMap = new Map(dailyRows.map((r) => [r.date, r]));

    const dailySales = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      const key = dateKeyInTz(d, timeZone);
      const row = dailyMap.get(key);
      dailySales.push({
        date: key,
        sales: row ? Number(row.sales) : 0,
        orders: row ? Number(row.orders) : 0,
      });
    }

    const todayKey = dateKeyInTz(new Date(), timeZone);
    const today = dailySales.find((d) => d.date === todayKey) || { sales: 0, orders: 0 };

    // Payments have no branchId column (bills do); this breakdown is
    // vendor-wide rather than branch-scoped -- acceptable for an MVP report.
    const methodRows = await Payment.findAll({
      where: { vendorId: req.vendorId, status: "recorded", paidAt: { [Op.gte]: since } },
      attributes: ["method", [fn("SUM", col("amount")), "amount"]],
      group: ["method"],
      raw: true,
    });

    res.json({
      today: { sales: today.sales, orders: today.orders },
      dailySales,
      paymentMethods: methodRows.map((r) => ({ method: r.method, amount: Number(r.amount) })),
    });
  } catch (err) {
    next(err);
  }
}

// A fuller analytics payload for the Reports page: sales trend, KPIs, and
// breakdowns by item/category/order-type/hour/discount/staff. Built as raw
// SQL (rather than Sequelize's grouped-include ORM path) because most of
// these are multi-table joins -- order_items -> orders -> menu_items ->
// menu_categories -- which Sequelize's `include` + `group` combination
// handles awkwardly. Every query is scoped by vendor (and branch, when the
// requester is pinned to one) via bound replacements, never string
// interpolation.
async function getAnalytics(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.vendorId);
    const timeZone = vendor.timezone || "UTC";

    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const vendorId = req.vendorId;
    const branchId = req.branchId || null;
    const replacements = { vendorId, branchId, since, timeZone };

    const billWhere = {
      vendorId,
      status: { [Op.ne]: "void" },
      generatedAt: { [Op.gte]: since },
      ...(branchId && { branchId }),
    };

    const dayExpr = fn("DATE", fn("timezone", timeZone, col("generated_at")));
    const dailyRowsPromise = Bill.findAll({
      where: billWhere,
      attributes: [
        [dayExpr, "date"],
        [fn("SUM", col("total_amount")), "sales"],
        [fn("COUNT", col("id")), "orders"],
      ],
      group: [literal("1")],
      raw: true,
    });

    const methodRowsPromise = Payment.findAll({
      where: { vendorId, status: "recorded", paidAt: { [Op.gte]: since } },
      attributes: ["method", [fn("SUM", col("amount")), "amount"]],
      group: ["method"],
      raw: true,
    });

    const overviewPromise = sequelize.query(
      `SELECT
         COUNT(b.id)::int AS "orders",
         COALESCE(SUM(b.total_amount), 0) AS "sales",
         COALESCE(SUM(b.tax_amount), 0) AS "taxCollected",
         COALESCE(SUM(b.discount_amount), 0) AS "discountGiven",
         COALESCE(AVG(b.total_amount), 0) AS "avgOrderValue"
       FROM bills b
       WHERE b.vendor_id = :vendorId
         AND b.status != 'void'
         AND b.generated_at >= :since
         AND (:branchId::uuid IS NULL OR b.branch_id = :branchId::uuid)`,
      { replacements, type: QueryTypes.SELECT }
    );

    const cancelledPromise = sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelled",
         COUNT(*)::int AS "totalPlaced"
       FROM orders
       WHERE vendor_id = :vendorId
         AND placed_at >= :since
         AND (:branchId::uuid IS NULL OR branch_id = :branchId::uuid)`,
      { replacements, type: QueryTypes.SELECT }
    );

    const orderTypesPromise = sequelize.query(
      `SELECT
         o.order_type AS "type",
         COUNT(o.id)::int AS "orders",
         COALESCE(SUM(o.total_amount), 0) AS "sales"
       FROM orders o
       WHERE o.vendor_id = :vendorId
         AND o.status = 'completed'
         AND o.completed_at >= :since
         AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       GROUP BY o.order_type
       ORDER BY "sales" DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const topItemsPromise = sequelize.query(
      `SELECT
         oi.menu_item_id AS "menuItemId",
         oi.item_name_snapshot AS "name",
         SUM(oi.quantity)::int AS "quantity",
         SUM(oi.line_total) AS "revenue"
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.vendor_id = :vendorId
         AND o.status = 'completed'
         AND o.completed_at >= :since
         AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       GROUP BY oi.menu_item_id, oi.item_name_snapshot
       ORDER BY "revenue" DESC
       LIMIT 10`,
      { replacements, type: QueryTypes.SELECT }
    );

    const categorySalesPromise = sequelize.query(
      `SELECT
         mc.id AS "categoryId",
         mc.name AS "name",
         SUM(oi.quantity)::int AS "quantity",
         SUM(oi.line_total) AS "revenue"
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE o.vendor_id = :vendorId
         AND o.status = 'completed'
         AND o.completed_at >= :since
         AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       GROUP BY mc.id, mc.name
       ORDER BY "revenue" DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const peakHoursPromise = sequelize.query(
      `SELECT
         EXTRACT(HOUR FROM timezone(:timeZone, b.generated_at))::int AS "hour",
         COUNT(b.id)::int AS "orders",
         COALESCE(SUM(b.total_amount), 0) AS "sales"
       FROM bills b
       WHERE b.vendor_id = :vendorId
         AND b.status != 'void'
         AND b.generated_at >= :since
         AND (:branchId::uuid IS NULL OR b.branch_id = :branchId::uuid)
       GROUP BY 1
       ORDER BY 1`,
      { replacements, type: QueryTypes.SELECT }
    );

    const discountsPromise = sequelize.query(
      `SELECT
         d.code AS "code",
         COUNT(b.id)::int AS "timesUsed",
         COALESCE(SUM(b.discount_amount), 0) AS "totalDiscount"
       FROM bills b
       JOIN discounts d ON d.id = b.discount_id
       WHERE b.vendor_id = :vendorId
         AND b.status != 'void'
         AND b.generated_at >= :since
         AND (:branchId::uuid IS NULL OR b.branch_id = :branchId::uuid)
       GROUP BY d.code
       ORDER BY "totalDiscount" DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Deliberately ignores req.branchId (ignores the active-branch selector)
    // -- the whole point of this section is comparing branches side by
    // side, so it always covers every branch the vendor has, regardless of
    // which one the requester currently has selected.
    const branchSalesPromise = sequelize.query(
      `SELECT
         b.branch_id AS "branchId",
         br.name AS "branchName",
         COUNT(b.id)::int AS "orders",
         COALESCE(SUM(b.total_amount), 0) AS "sales"
       FROM bills b
       JOIN branches br ON br.id = b.branch_id
       WHERE b.vendor_id = :vendorId
         AND b.status != 'void'
         AND b.generated_at >= :since
       GROUP BY b.branch_id, br.name
       ORDER BY "sales" DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const staffPerformancePromise = sequelize.query(
      `SELECT
         u.id AS "userId",
         u.first_name AS "firstName",
         u.last_name AS "lastName",
         COUNT(o.id)::int AS "orders",
         COALESCE(SUM(o.total_amount), 0) AS "sales"
       FROM orders o
       JOIN users u ON u.id = o.created_by
       WHERE o.vendor_id = :vendorId
         AND o.status = 'completed'
         AND o.completed_at >= :since
         AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY "sales" DESC
       LIMIT 10`,
      { replacements, type: QueryTypes.SELECT }
    );

    const [
      dailyRows,
      methodRows,
      [overview],
      [cancelled],
      orderTypes,
      topItems,
      categorySales,
      peakHours,
      discounts,
      branchSales,
      staffPerformance,
    ] = await Promise.all([
      dailyRowsPromise,
      methodRowsPromise,
      overviewPromise,
      cancelledPromise,
      orderTypesPromise,
      topItemsPromise,
      categorySalesPromise,
      peakHoursPromise,
      discountsPromise,
      branchSalesPromise,
      staffPerformancePromise,
    ]);

    const dailyMap = new Map(dailyRows.map((r) => [r.date, r]));
    const dailySales = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      const key = dateKeyInTz(d, timeZone);
      const row = dailyMap.get(key);
      dailySales.push({
        date: key,
        sales: row ? Number(row.sales) : 0,
        orders: row ? Number(row.orders) : 0,
      });
    }

    const peakHoursByHour = new Map(peakHours.map((r) => [r.hour, r]));
    const peakHoursFull = [];
    for (let h = 0; h < 24; h++) {
      const row = peakHoursByHour.get(h);
      peakHoursFull.push({
        hour: h,
        orders: row ? Number(row.orders) : 0,
        sales: row ? Number(row.sales) : 0,
      });
    }

    res.json({
      range: { since: dateKeyInTz(since, timeZone), days },
      overview: {
        sales: Number(overview.sales),
        orders: overview.orders,
        avgOrderValue: Number(overview.avgOrderValue),
        taxCollected: Number(overview.taxCollected),
        discountGiven: Number(overview.discountGiven),
        cancelledOrders: cancelled.cancelled,
        totalOrdersPlaced: cancelled.totalPlaced,
      },
      dailySales,
      paymentMethods: methodRows.map((r) => ({ method: r.method, amount: Number(r.amount) })),
      orderTypes: orderTypes.map((r) => ({ type: r.type, orders: r.orders, sales: Number(r.sales) })),
      topItems: topItems.map((r) => ({
        menuItemId: r.menuItemId,
        name: r.name,
        quantity: r.quantity,
        revenue: Number(r.revenue),
      })),
      categorySales: categorySales.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        quantity: r.quantity,
        revenue: Number(r.revenue),
      })),
      peakHours: peakHoursFull,
      discounts: discounts.map((r) => ({
        code: r.code,
        timesUsed: r.timesUsed,
        totalDiscount: Number(r.totalDiscount),
      })),
      branchSales: branchSales.map((r) => ({
        branchId: r.branchId,
        branchName: r.branchName,
        orders: r.orders,
        sales: Number(r.sales),
      })),
      staffPerformance: staffPerformance.map((r) => ({
        userId: r.userId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
        orders: r.orders,
        sales: Number(r.sales),
      })),
    });
  } catch (err) {
    next(err);
  }
}

// A personal activity view for front-line staff (waiter/cashier) whose role
// doesn't grant access to vendor-wide reports -- scoped to req.user.id
// rather than the whole vendor, so it's safe for any authenticated role to
// call regardless of the reports RBAC gate. Orders are counted by placedAt
// (not completedAt) so a waiter sees "orders I took today" in real time,
// not only ones that have since been billed and closed out.
async function getMyActivity(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.vendorId);
    const timeZone = vendor.timezone || "UTC";

    const days = Math.min(Number(req.query.days) || 7, 30);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const replacements = {
      vendorId: req.vendorId,
      branchId: req.branchId || null,
      userId: req.user.id,
      since,
      timeZone,
    };

    const orderDailyPromise = sequelize.query(
      `SELECT
         DATE(timezone(:timeZone, o.placed_at)) AS "date",
         COUNT(o.id)::int AS "orders",
         COALESCE(SUM(o.total_amount), 0) AS "sales"
       FROM orders o
       WHERE o.vendor_id = :vendorId
         AND o.created_by = :userId
         AND o.status != 'cancelled'
         AND o.placed_at >= :since
         AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       GROUP BY 1`,
      { replacements, type: QueryTypes.SELECT }
    );

    const orderTypesPromise = sequelize.query(
      `SELECT o.order_type AS "type", COUNT(o.id)::int AS "orders"
       FROM orders o
       WHERE o.vendor_id = :vendorId
         AND o.created_by = :userId
         AND o.status != 'cancelled'
         AND o.placed_at >= :since
         AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       GROUP BY o.order_type
       ORDER BY "orders" DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const billDailyPromise = sequelize.query(
      `SELECT
         DATE(timezone(:timeZone, b.generated_at)) AS "date",
         COUNT(b.id)::int AS "orders",
         COALESCE(SUM(b.total_amount), 0) AS "sales"
       FROM bills b
       WHERE b.vendor_id = :vendorId
         AND b.generated_by = :userId
         AND b.status != 'void'
         AND b.generated_at >= :since
         AND (:branchId::uuid IS NULL OR b.branch_id = :branchId::uuid)
       GROUP BY 1`,
      { replacements, type: QueryTypes.SELECT }
    );

    // Payments have no branch_id column (see getSummary above), and are
    // attributed to whoever recorded the payment rather than whoever
    // generated the bill -- the more accurate measure of a cashier's own
    // cash-handling activity.
    const paymentMethodsPromise = sequelize.query(
      `SELECT p.method AS "method", COALESCE(SUM(p.amount), 0) AS "amount"
       FROM payments p
       WHERE p.vendor_id = :vendorId
         AND p.recorded_by = :userId
         AND p.status = 'recorded'
         AND p.paid_at >= :since
       GROUP BY p.method
       ORDER BY "amount" DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const [orderDailyRows, orderTypes, billDailyRows, paymentMethods] = await Promise.all([
      orderDailyPromise,
      orderTypesPromise,
      billDailyPromise,
      paymentMethodsPromise,
    ]);

    function zeroFillDaily(rows) {
      const map = new Map(rows.map((r) => [r.date, r]));
      const out = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const key = dateKeyInTz(d, timeZone);
        const row = map.get(key);
        out.push({ date: key, orders: row ? Number(row.orders) : 0, sales: row ? Number(row.sales) : 0 });
      }
      return out;
    }

    const orderDaily = zeroFillDaily(orderDailyRows);
    const billDaily = zeroFillDaily(billDailyRows);
    const todayKey = dateKeyInTz(new Date(), timeZone);

    res.json({
      range: { since: dateKeyInTz(since, timeZone), days },
      ordersCreated: {
        today: orderDaily.find((d) => d.date === todayKey) || { orders: 0, sales: 0 },
        dailyTrend: orderDaily,
        orderTypes: orderTypes.map((t) => ({ type: t.type, orders: t.orders })),
      },
      billsGenerated: {
        today: billDaily.find((d) => d.date === todayKey) || { orders: 0, sales: 0 },
        dailyTrend: billDaily,
        paymentMethods: paymentMethods.map((m) => ({ method: m.method, amount: Number(m.amount) })),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, getAnalytics, getMyActivity };
