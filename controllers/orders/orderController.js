const {
  sequelize,
  Order,
  OrderItem,
  OrderItemAddon,
  RestaurantTable,
  Vendor,
  Branch,
  User,
} = require("../../models");
const counterService = require("../../services/counterService");
const { computeOrderLines, OrderValidationError } = require("../../services/orderPricingService");
const { ORDER_TYPES, ORDER_STATUS_TRANSITIONS } = require("../../config/constants");

const orderIncludes = [
  { model: RestaurantTable, as: "table", attributes: ["id", "name", "status"] },
  { model: User, as: "creator", attributes: ["id", "firstName", "lastName"] },
  { model: User, as: "server", attributes: ["id", "firstName", "lastName"] },
  {
    model: OrderItem,
    as: "items",
    include: [{ model: OrderItemAddon, as: "addons" }],
  },
];

async function resolveBranchFilter(req) {
  if (req.branchId) return req.branchId;
  if (req.query.branchId) {
    const branch = await Branch.findOne({ where: { id: req.query.branchId, vendorId: req.vendorId } });
    return branch ? branch.id : undefined;
  }
  return undefined;
}

async function releaseTableIfIdle(tableId, transaction) {
  const activeCount = await Order.count({
    where: { tableId, status: ["placed", "preparing", "ready", "served"] },
    transaction,
  });
  if (activeCount === 0) {
    await RestaurantTable.update({ status: "available" }, { where: { id: tableId }, transaction });
  }
}

async function listOrders(req, res, next) {
  try {
    const branchId = await resolveBranchFilter(req);
    const where = { vendorId: req.vendorId, ...(branchId && { branchId }) };
    if (req.query.status) where.status = req.query.status;

    const orders = await Order.findAll({
      where,
      include: orderIncludes,
      order: [["placedAt", "DESC"]],
      limit: 100,
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
      include: orderIncludes,
    });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { tableId, orderType, customerName, customerPhone, deliveryAddress, notes, items } = req.body;
    const effectiveBranchId = req.branchId || req.body.branchId;

    if (!effectiveBranchId) {
      await t.rollback();
      return res.status(400).json({ message: "branchId is required" });
    }
    if (!ORDER_TYPES.includes(orderType)) {
      await t.rollback();
      return res.status(400).json({ message: `orderType must be one of ${ORDER_TYPES.join(", ")}` });
    }
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: "At least one item is required" });
    }

    const branch = await Branch.findOne({ where: { id: effectiveBranchId, vendorId: req.vendorId }, transaction: t });
    if (!branch) {
      await t.rollback();
      return res.status(400).json({ message: "Invalid branch for this vendor" });
    }

    let table = null;
    if (orderType === "dine_in") {
      if (!tableId) {
        await t.rollback();
        return res.status(400).json({ message: "tableId is required for dine-in orders" });
      }
      table = await RestaurantTable.findOne({
        where: { id: tableId, vendorId: req.vendorId, branchId: branch.id },
        transaction: t,
      });
      if (!table) {
        await t.rollback();
        return res.status(400).json({ message: "Invalid table for this branch" });
      }
    }

    const vendor = await Vendor.findByPk(req.vendorId, { transaction: t });

    let lineData, subtotal, taxAmount, totalAmount;
    try {
      ({ lineData, subtotal, taxAmount, totalAmount } = await computeOrderLines(
        { vendorId: req.vendorId, items, vendor },
        t
      ));
    } catch (err) {
      await t.rollback();
      if (err instanceof OrderValidationError) return res.status(err.status).json({ message: err.message });
      throw err;
    }

    const sequence = await counterService.getNextNumber(
      { vendorId: req.vendorId, branchId: branch.id, counterType: "order" },
      t
    );
    const orderNumber = counterService.formatNumber("ORD", sequence);

    const order = await Order.create(
      {
        vendorId: req.vendorId,
        branchId: branch.id,
        tableId: table ? table.id : null,
        orderNumber,
        orderType,
        status: "placed",
        customerName,
        customerPhone,
        deliveryAddress,
        notes,
        subtotal,
        discountAmount: 0,
        taxAmount,
        totalAmount,
        createdBy: req.user.id,
        placedAt: new Date(),
      },
      { transaction: t }
    );

    for (const line of lineData) {
      const orderItem = await OrderItem.create(
        {
          orderId: order.id,
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          itemNameSnapshot: line.itemNameSnapshot,
          variantNameSnapshot: line.variantNameSnapshot,
          unitPriceSnapshot: line.unitPriceSnapshot,
          taxRatePercentSnapshot: line.taxRatePercentSnapshot,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          notes: line.notes,
        },
        { transaction: t }
      );
      if (line.addonRows.length > 0) {
        await OrderItemAddon.bulkCreate(
          line.addonRows.map((a) => ({ ...a, orderItemId: orderItem.id })),
          { transaction: t }
        );
      }
    }

    if (table) {
      await table.update({ status: "occupied" }, { transaction: t });
    }

    await t.commit();

    const created = await Order.findByPk(order.id, { include: orderIncludes });
    res.status(201).json(created);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function updateOrderStatus(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
      transaction: t,
    });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: "Order not found" });
    }

    const { status } = req.body;
    const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      await t.rollback();
      return res.status(409).json({
        message: `Cannot move order from '${order.status}' to '${status}'. Allowed: ${allowedNext.join(", ") || "none"}`,
      });
    }

    const updates = { status };
    if (status === "served") updates.servedBy = req.user.id;
    if (status === "completed" || status === "cancelled") updates.completedAt = new Date();

    await order.update(updates, { transaction: t });

    if (order.tableId && (status === "completed" || status === "cancelled")) {
      await releaseTableIfIdle(order.tableId, t);
    }

    await t.commit();

    const updated = await Order.findByPk(order.id, { include: orderIncludes });
    res.json(updated);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = { listOrders, getOrder, createOrder, updateOrderStatus };
