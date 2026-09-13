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
const { Op } = require("sequelize");
const counterService = require("../../services/counterService");
const { computeOrderLines, OrderValidationError } = require("../../services/orderPricingService");
const { ORDER_TYPES, ORDER_STATUS_TRANSITIONS, ACTIVE_ORDER_STATUSES } = require("../../config/constants");
const logger = require("../../utils/logger");

const orderIncludes = [
  { model: RestaurantTable, as: "table", attributes: ["id", "name", "location", "status"] },
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
    where: { tableId, status: ACTIVE_ORDER_STATUSES },
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

      const existingOrder = await Order.findOne({
        where: { tableId: table.id, status: ACTIVE_ORDER_STATUSES },
        transaction: t,
      });
      if (existingOrder) {
        await t.rollback();
        return res.status(409).json({
          message: `${table.name} already has a pending order (${existingOrder.orderNumber}). Complete or cancel it before starting a new one.`,
        });
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

    logger.info("order.created", {
      vendorId: req.vendorId,
      userId: req.user.id,
      orderId: order.id,
      orderNumber,
      orderType,
      tableId: table?.id,
      totalAmount,
    });

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

    logger.info("order.status_updated", {
      vendorId: req.vendorId,
      userId: req.user.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      from: order.previous("status"),
      to: status,
    });

    const updated = await Order.findByPk(order.id, { include: orderIncludes });
    res.json(updated);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// Lets front-of-house move a dine-in order to a different table (a customer
// asked to switch seats, a table got double-booked, etc.) without cancelling
// and re-placing it -- items, KOT history, and totals all stay intact.
async function transferTable(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findOne({ where: { id: req.params.id, vendorId: req.vendorId }, transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.orderType !== "dine_in") {
      await t.rollback();
      return res.status(400).json({ message: "Only dine-in orders can be moved between tables" });
    }
    if (["completed", "cancelled"].includes(order.status)) {
      await t.rollback();
      return res.status(409).json({ message: "Cannot move a completed or cancelled order" });
    }

    const { tableId } = req.body;
    if (!tableId) {
      await t.rollback();
      return res.status(400).json({ message: "tableId is required" });
    }
    if (tableId === order.tableId) {
      await t.rollback();
      return res.status(400).json({ message: "Order is already on that table" });
    }

    const newTable = await RestaurantTable.findOne({
      where: { id: tableId, vendorId: req.vendorId, branchId: order.branchId },
      transaction: t,
    });
    if (!newTable) {
      await t.rollback();
      return res.status(400).json({ message: "Invalid table for this order's branch" });
    }

    const conflictingOrder = await Order.findOne({
      where: { tableId: newTable.id, status: ACTIVE_ORDER_STATUSES, id: { [Op.ne]: order.id } },
      transaction: t,
    });
    if (conflictingOrder) {
      await t.rollback();
      return res.status(409).json({
        message: `${newTable.name} already has a pending order (${conflictingOrder.orderNumber}).`,
      });
    }

    const previousTableId = order.tableId;
    await order.update({ tableId: newTable.id }, { transaction: t });
    await newTable.update({ status: "occupied" }, { transaction: t });
    if (previousTableId) await releaseTableIfIdle(previousTableId, t);

    await t.commit();

    logger.info("order.table_transferred", {
      vendorId: req.vendorId,
      userId: req.user.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      fromTableId: previousTableId,
      toTableId: newTable.id,
    });

    const updated = await Order.findByPk(order.id, { include: orderIncludes });
    res.json(updated);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// Lets front-of-house add more items to an order that's already in progress
// (a table orders dessert after being served, a takeaway customer adds one
// more thing before it's picked up) instead of starting a separate order.
// There's no per-item prep status, so if the order had already moved past
// 'placed' it goes back there -- kitchen sees the full item list again,
// including the ones already served.
async function addItemsToOrder(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findOne({ where: { id: req.params.id, vendorId: req.vendorId }, transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: "Order not found" });
    }
    if (["completed", "cancelled"].includes(order.status)) {
      await t.rollback();
      return res.status(409).json({ message: "Cannot add items to a completed or cancelled order" });
    }

    const { items } = req.body;
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

    await order.update(
      {
        subtotal: Number(order.subtotal) + subtotal,
        taxAmount: Number(order.taxAmount) + taxAmount,
        totalAmount: Number(order.totalAmount) + totalAmount,
        ...(order.status !== "placed" && { status: "placed" }),
      },
      { transaction: t }
    );

    await t.commit();

    logger.info("order.items_added", {
      vendorId: req.vendorId,
      userId: req.user.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemCount: lineData.length,
      addedAmount: totalAmount,
    });

    const updated = await Order.findByPk(order.id, { include: orderIncludes });
    res.status(201).json(updated);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = { listOrders, getOrder, createOrder, updateOrderStatus, transferTable, addItemsToOrder };
