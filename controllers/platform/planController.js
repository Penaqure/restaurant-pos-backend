const { SubscriptionPlan, Vendor } = require("../../models");
const logger = require("../../utils/logger");

async function listPlans(req, res, next) {
  try {
    const plans = await SubscriptionPlan.findAll({ order: [["priceMonthly", "ASC"]] });
    res.json(plans);
  } catch (err) {
    next(err);
  }
}

async function createPlan(req, res, next) {
  try {
    const { name, priceMonthly, billingCycle, maxBranches, maxUsers } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const plan = await SubscriptionPlan.create({
      name,
      priceMonthly: priceMonthly ?? 0,
      billingCycle: billingCycle || "monthly",
      maxBranches: maxBranches ?? 1,
      maxUsers: maxUsers ?? 5,
    });
    logger.info("platform.plan_created", { platformUserId: req.user.id, planId: plan.id, name: plan.name });
    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

async function updatePlan(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const { name, priceMonthly, billingCycle, maxBranches, maxUsers, isActive } = req.body;
    await plan.update({
      ...(name !== undefined && { name }),
      ...(priceMonthly !== undefined && { priceMonthly }),
      ...(billingCycle !== undefined && { billingCycle }),
      ...(maxBranches !== undefined && { maxBranches }),
      ...(maxUsers !== undefined && { maxUsers }),
      ...(isActive !== undefined && { isActive }),
    });
    logger.info("platform.plan_updated", { platformUserId: req.user.id, planId: plan.id });
    res.json(plan);
  } catch (err) {
    next(err);
  }
}

// vendors.plan_id is ON DELETE SET NULL, so this never orphans a row -- any
// vendor on this plan just falls back to "no plan assigned" (unrestricted).
// Still confirmed client-side since that silently drops their limits.
async function deletePlan(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const vendorCount = await Vendor.count({ where: { planId: plan.id } });
    await plan.destroy();
    logger.info("platform.plan_deleted", { platformUserId: req.user.id, planId: plan.id, vendorsAffected: vendorCount });
    res.status(200).json({ vendorsAffected: vendorCount });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
