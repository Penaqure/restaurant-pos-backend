const { RestaurantTable, Branch } = require("../../models");

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
    const { name, capacity, branchId } = req.body;
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
      capacity: capacity ?? 4,
    });
    res.status(201).json(table);
  } catch (err) {
    next(err);
  }
}

async function updateTable(req, res, next) {
  try {
    const table = await RestaurantTable.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!table) return res.status(404).json({ message: "Table not found" });

    const { name, capacity, status } = req.body;
    await table.update({
      ...(name !== undefined && { name }),
      ...(capacity !== undefined && { capacity }),
      ...(status !== undefined && { status }),
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
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listTables, createTable, updateTable, deleteTable };
