const { Branch, Vendor, SubscriptionPlan, Order } = require("../../models");
const logger = require("../../utils/logger");

async function listBranches(req, res, next) {
  try {
    const branches = await Branch.findAll({ where: { vendorId: req.vendorId }, order: [["name", "ASC"]] });
    res.json(branches);
  } catch (err) {
    next(err);
  }
}

async function createBranch(req, res, next) {
  try {
    const { name, address, city, phone, gstin } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    // Plans cap how many branches a vendor can have; a vendor with no plan
    // assigned is unrestricted (treated as an unmetered/legacy tenant) --
    // mirrors the maxUsers check in staffController.
    const vendor = await Vendor.findByPk(req.vendorId, { include: [{ model: SubscriptionPlan, as: "plan" }] });
    if (vendor.plan) {
      const branchCount = await Branch.count({ where: { vendorId: req.vendorId } });
      if (branchCount >= vendor.plan.maxBranches) {
        return res.status(403).json({
          message: `Branch limit reached for the ${vendor.plan.name} plan (${vendor.plan.maxBranches} branches). Upgrade your plan to add more.`,
        });
      }
    }

    const branch = await Branch.create({ vendorId: req.vendorId, name, address, city, phone, gstin });
    logger.info("branch.created", { vendorId: req.vendorId, userId: req.user.id, branchId: branch.id, name });
    res.status(201).json(branch);
  } catch (err) {
    next(err);
  }
}

async function updateBranch(req, res, next) {
  try {
    const branch = await Branch.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!branch) return res.status(404).json({ message: "Branch not found" });

    const { name, address, city, phone, gstin, isActive } = req.body;

    if (isActive === false && branch.isActive) {
      const activeCount = await Branch.count({ where: { vendorId: req.vendorId, isActive: true } });
      if (activeCount <= 1) {
        return res.status(409).json({ message: "Can't deactivate the last active branch" });
      }
    }

    await branch.update({
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(phone !== undefined && { phone }),
      ...(gstin !== undefined && { gstin }),
      ...(isActive !== undefined && { isActive }),
    });
    logger.info("branch.updated", {
      vendorId: req.vendorId,
      userId: req.user.id,
      branchId: branch.id,
      ...(isActive !== undefined && { isActive }),
    });
    res.json(branch);
  } catch (err) {
    next(err);
  }
}

// Every order/table/counter under a branch cascades on delete (see the
// branch_id foreign keys in those migrations), so a branch with any order
// history is never hard-deleted -- deactivate it instead, same rule as
// vendor deletion.
async function deleteBranch(req, res, next) {
  try {
    const branch = await Branch.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!branch) return res.status(404).json({ message: "Branch not found" });

    const branchCount = await Branch.count({ where: { vendorId: req.vendorId } });
    if (branchCount <= 1) {
      return res.status(409).json({ message: "Can't delete the vendor's only branch" });
    }

    const orderCount = await Order.count({ where: { branchId: branch.id } });
    if (orderCount > 0) {
      return res.status(409).json({
        message: `This branch has ${orderCount} order(s) on record and can't be deleted. Deactivate it instead to keep the history.`,
      });
    }

    await branch.destroy();
    logger.info("branch.deleted", { vendorId: req.vendorId, userId: req.user.id, branchId: branch.id, name: branch.name });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listBranches, createBranch, updateBranch, deleteBranch };
