const { Op, fn, col } = require("sequelize");
const { MenuItem, MenuCategory, Bill } = require("../../models");

// Read-only, informational surface for the standalone inventory system --
// menu names/prices so it can label ingredients against dishes, and a sales
// total so its "Billing sales data" page has something real to show. Never
// called from any critical path on this side.
async function listMenuItems(req, res, next) {
  try {
    const items = await MenuItem.findAll({
      where: { vendorId: req.vendorId },
      include: [{ model: MenuCategory, as: "category", attributes: ["id", "name"] }],
      attributes: ["id", "name", "basePrice", "isVeg", "isAvailable"],
      order: [["name", "ASC"]],
    });
    res.json(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        categoryName: i.category?.name || null,
        basePrice: i.basePrice,
        isVeg: i.isVeg,
        isAvailable: i.isAvailable,
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function getSalesSummary(req, res, next) {
  try {
    const { from, to } = req.query;
    const where = { vendorId: req.vendorId, status: { [Op.ne]: "void" } };
    if (from || to) {
      where.generatedAt = {};
      if (from) where.generatedAt[Op.gte] = new Date(`${from}T00:00:00`);
      if (to) where.generatedAt[Op.lte] = new Date(`${to}T23:59:59.999`);
    }

    const [row] = await Bill.findAll({
      where,
      attributes: [
        [fn("COALESCE", fn("SUM", col("total_amount")), 0), "totalSales"],
        [fn("COUNT", col("id")), "billCount"],
      ],
      raw: true,
    });

    res.json({
      from: from || null,
      to: to || null,
      totalSales: Number(row.totalSales),
      billCount: Number(row.billCount),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMenuItems, getSalesSummary };
