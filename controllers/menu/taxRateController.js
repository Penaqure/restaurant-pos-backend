const { sequelize, TaxRate } = require("../../models");

async function listTaxRates(req, res, next) {
  try {
    const rates = await TaxRate.findAll({ where: { vendorId: req.vendorId }, order: [["name", "ASC"]] });
    res.json(rates);
  } catch (err) {
    next(err);
  }
}

async function createTaxRate(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { name, ratePercent, isDefault } = req.body;
    if (!name || ratePercent === undefined) {
      await t.rollback();
      return res.status(400).json({ message: "name and ratePercent are required" });
    }

    if (isDefault) {
      await TaxRate.update(
        { isDefault: false },
        { where: { vendorId: req.vendorId, isDefault: true }, transaction: t }
      );
    }

    const rate = await TaxRate.create(
      { vendorId: req.vendorId, name, ratePercent, isDefault: !!isDefault },
      { transaction: t }
    );
    await t.commit();
    res.status(201).json(rate);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function updateTaxRate(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const rate = await TaxRate.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
      transaction: t,
    });
    if (!rate) {
      await t.rollback();
      return res.status(404).json({ message: "Tax rate not found" });
    }

    const { name, ratePercent, isDefault, isActive } = req.body;
    if (isDefault) {
      await TaxRate.update(
        { isDefault: false },
        { where: { vendorId: req.vendorId, isDefault: true }, transaction: t }
      );
    }

    await rate.update(
      {
        ...(name !== undefined && { name }),
        ...(ratePercent !== undefined && { ratePercent }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
      },
      { transaction: t }
    );
    await t.commit();
    res.json(rate);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function deleteTaxRate(req, res, next) {
  try {
    const rate = await TaxRate.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!rate) return res.status(404).json({ message: "Tax rate not found" });
    await rate.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listTaxRates, createTaxRate, updateTaxRate, deleteTaxRate };
