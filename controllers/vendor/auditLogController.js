const { Op } = require("sequelize");
const { AuditLog, User } = require("../../models");

const PAGE_SIZE = 50;

async function listAuditLog(req, res, next) {
  try {
    const { from, to, action, page } = req.query;
    const where = { vendorId: req.vendorId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(`${from}T00:00:00`);
      if (to) where.createdAt[Op.lte] = new Date(`${to}T23:59:59.999`);
    }
    // Prefix match (e.g. "payment" matches "payment.recorded",
    // "payment.voided", "payment.refunded") so the filter doesn't need to
    // know every exact action string.
    if (action) where.action = { [Op.iLike]: `${action}%` };

    const pageNum = Math.max(1, Number(page) || 1);
    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "firstName", "lastName"] }],
      order: [["createdAt", "DESC"]],
      limit: PAGE_SIZE,
      offset: (pageNum - 1) * PAGE_SIZE,
    });

    res.json({ entries: rows, total: count, page: pageNum, pageSize: PAGE_SIZE });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLog };
