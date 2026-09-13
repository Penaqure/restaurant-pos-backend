const { Discount } = require("../../models");
const logger = require("../../utils/logger");

async function listDiscounts(req, res, next) {
  try {
    const discounts = await Discount.findAll({ where: { vendorId: req.vendorId }, order: [["code", "ASC"]] });
    res.json(discounts);
  } catch (err) {
    next(err);
  }
}

async function createDiscount(req, res, next) {
  try {
    const { code, type, value, minOrderAmount, validFrom, validTo, usageLimit } = req.body;
    if (!code || !type || value === undefined) {
      return res.status(400).json({ message: "code, type and value are required" });
    }
    if (!["percentage", "flat"].includes(type)) {
      return res.status(400).json({ message: "type must be 'percentage' or 'flat'" });
    }

    const discount = await Discount.create({
      vendorId: req.vendorId,
      code: code.toUpperCase(),
      type,
      value,
      minOrderAmount: minOrderAmount ?? 0,
      validFrom: validFrom || null,
      validTo: validTo || null,
      usageLimit: usageLimit || null,
    });
    logger.info("discount.created", { vendorId: req.vendorId, userId: req.user.id, discountId: discount.id, code: discount.code });
    res.status(201).json(discount);
  } catch (err) {
    next(err);
  }
}

async function updateDiscount(req, res, next) {
  try {
    const discount = await Discount.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!discount) return res.status(404).json({ message: "Discount not found" });

    const { isActive, value, minOrderAmount, validFrom, validTo, usageLimit } = req.body;
    await discount.update({
      ...(isActive !== undefined && { isActive }),
      ...(value !== undefined && { value }),
      ...(minOrderAmount !== undefined && { minOrderAmount }),
      ...(validFrom !== undefined && { validFrom }),
      ...(validTo !== undefined && { validTo }),
      ...(usageLimit !== undefined && { usageLimit }),
    });
    logger.info("discount.updated", { vendorId: req.vendorId, userId: req.user.id, discountId: discount.id, code: discount.code });
    res.json(discount);
  } catch (err) {
    next(err);
  }
}

async function deleteDiscount(req, res, next) {
  try {
    const discount = await Discount.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!discount) return res.status(404).json({ message: "Discount not found" });
    await discount.destroy();
    logger.info("discount.deleted", { vendorId: req.vendorId, userId: req.user.id, discountId: discount.id, code: discount.code });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listDiscounts, createDiscount, updateDiscount, deleteDiscount };
