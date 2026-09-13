const { RestaurantTable, Branch, Order } = require("../../models");
const { ACTIVE_ORDER_STATUSES } = require("../../config/constants");
const logger = require("../../utils/logger");

async function resolveBranchFilter(req) {
  // Owner/manager (branchId === null on their token) can pass ?branchId= to
  // scope the view; cashier/waiter are always pinned to req.branchId already.
  if (req.branchId) return req.branchId;
  if (req.query.branchId) {
    const branch = await Branch.findOne({ where: { id: req.query.branchId, vendorId: req.vendorId } });
    return branch ? branch.id : undefined;
  }
  return undefined;
}

async function listTables(req, res, next) {
  try {
    const branchId = await resolveBranchFilter(req);
    const where = { vendorId: req.vendorId, ...(branchId && { branchId }) };
    const tables = await RestaurantTable.findAll({
      where,
      include: [{ model: Branch, as: "branch", attributes: ["id", "name"] }],
      order: [["name", "ASC"]],
    });
    res.json(tables);
  } catch (err) {
    next(err);
  }
}

async function createTable(req, res, next) {
  try {
    const { name, capacity, branchId, location } = req.body;
    const effectiveBranchId = req.branchId || branchId;
    if (!name || !effectiveBranchId) {
      return res.status(400).json({ message: "name and branchId are required" });
    }

    const branch = await Branch.findOne({ where: { id: effectiveBranchId, vendorId: req.vendorId } });
    if (!branch) return res.status(400).json({ message: "Invalid branch for this vendor" });

    const table = await RestaurantTable.create({
      vendorId: req.vendorId,
      branchId: branch.id,
      name,
      location: location || null,
      capacity: capacity ?? 4,
    });
    logger.info("table.created", { vendorId: req.vendorId, userId: req.user.id, tableId: table.id, name: table.name });
    res.status(201).json(table);
  } catch (err) {
    next(err);
  }
}

async function updateTable(req, res, next) {
  try {
    const table = await RestaurantTable.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!table) return res.status(404).json({ message: "Table not found" });

    const { name, capacity, status, location } = req.body;

    // Manual status flips (available/occupied/reserved/cleaning) are for
    // staff bookkeeping between orders -- while an order is actually in
    // progress, occupancy is driven by the order lifecycle instead, so
    // manual changes are blocked until it's completed or cancelled.
    if (status !== undefined && status !== table.status) {
      const activeOrder = await Order.findOne({ where: { tableId: table.id, status: ACTIVE_ORDER_STATUSES } });
      if (activeOrder) {
        logger.warn("table.status_change_blocked", {
          vendorId: req.vendorId,
          userId: req.user.id,
          tableId: table.id,
          attemptedStatus: status,
          blockingOrderId: activeOrder.id,
        });
        return res.status(409).json({
          message: `Cannot change status while ${table.name} has an active order (${activeOrder.orderNumber}). It will free up automatically once that order is completed or cancelled.`,
        });
      }
    }

    const previousStatus = table.status;
    await table.update({
      ...(name !== undefined && { name }),
      ...(capacity !== undefined && { capacity }),
      ...(status !== undefined && { status }),
      ...(location !== undefined && { location: location || null }),
    });
    logger.info("table.updated", {
      vendorId: req.vendorId,
      userId: req.user.id,
      tableId: table.id,
      ...(status !== undefined && status !== previousStatus && { statusFrom: previousStatus, statusTo: status }),
    });
    res.json(table);
  } catch (err) {
    next(err);
  }
}

async function deleteTable(req, res, next) {
  try {
    const table = await RestaurantTable.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!table) return res.status(404).json({ message: "Table not found" });
    await table.destroy();
    logger.info("table.deleted", { vendorId: req.vendorId, userId: req.user.id, tableId: table.id, name: table.name });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listTables, createTable, updateTable, deleteTable };
