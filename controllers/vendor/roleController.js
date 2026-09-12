const { Role } = require("../../models");

async function listRoles(req, res, next) {
  try {
    const roles = await Role.findAll({
      where: { vendorId: req.vendorId },
      attributes: ["id", "name", "permissions"],
      order: [["name", "ASC"]],
    });
    res.json(roles);
  } catch (err) {
    next(err);
  }
}

module.exports = { listRoles };
