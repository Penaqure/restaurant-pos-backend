const path = require("path");
const { sequelize, MenuItem, MenuCategory, TaxRate, ItemVariant, ItemAddon } = require("../../models");

const itemIncludes = [
  { model: ItemVariant, as: "variants" },
  { model: ItemAddon, as: "addons" },
  { model: MenuCategory, as: "category", attributes: ["id", "name"] },
  { model: TaxRate, as: "taxRate", attributes: ["id", "name", "ratePercent"] },
];

async function assertCategoryOwnedByVendor(categoryId, vendorId, transaction) {
  const category = await MenuCategory.findOne({ where: { id: categoryId, vendorId }, transaction });
  return !!category;
}

async function listItems(req, res, next) {
  try {
    const where = { vendorId: req.vendorId };
    if (req.query.categoryId) where.categoryId = req.query.categoryId;

    const items = await MenuItem.findAll({ where, include: itemIncludes, order: [["sortOrder", "ASC"]] });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    const item = await MenuItem.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
      include: itemIncludes,
    });
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { categoryId, name, description, basePrice, isVeg, taxRateId, variants, addons } = req.body;

    if (!categoryId || !name || basePrice === undefined) {
      await t.rollback();
      return res.status(400).json({ message: "categoryId, name and basePrice are required" });
    }

    if (!(await assertCategoryOwnedByVendor(categoryId, req.vendorId, t))) {
      await t.rollback();
      return res.status(400).json({ message: "Invalid category for this vendor" });
    }

    if (taxRateId) {
      const rate = await TaxRate.findOne({ where: { id: taxRateId, vendorId: req.vendorId }, transaction: t });
      if (!rate) {
        await t.rollback();
        return res.status(400).json({ message: "Invalid tax rate for this vendor" });
      }
    }

    const item = await MenuItem.create(
      {
        vendorId: req.vendorId,
        categoryId,
        name,
        description,
        basePrice,
        isVeg: isVeg ?? true,
        taxRateId: taxRateId || null,
      },
      { transaction: t }
    );

    if (Array.isArray(variants) && variants.length > 0) {
      await ItemVariant.bulkCreate(
        variants.map((v) => ({ menuItemId: item.id, name: v.name, price: v.price, isDefault: !!v.isDefault })),
        { transaction: t }
      );
    }

    if (Array.isArray(addons) && addons.length > 0) {
      await ItemAddon.bulkCreate(
        addons.map((a) => ({ menuItemId: item.id, name: a.name, price: a.price })),
        { transaction: t }
      );
    }

    await t.commit();

    const created = await MenuItem.findByPk(item.id, { include: itemIncludes });
    res.status(201).json(created);
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const item = await MenuItem.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const { categoryId, name, description, basePrice, isVeg, isAvailable, taxRateId } = req.body;

    if (categoryId && !(await assertCategoryOwnedByVendor(categoryId, req.vendorId))) {
      return res.status(400).json({ message: "Invalid category for this vendor" });
    }
    if (taxRateId) {
      const rate = await TaxRate.findOne({ where: { id: taxRateId, vendorId: req.vendorId } });
      if (!rate) return res.status(400).json({ message: "Invalid tax rate for this vendor" });
    }

    await item.update({
      ...(categoryId !== undefined && { categoryId }),
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(basePrice !== undefined && { basePrice }),
      ...(isVeg !== undefined && { isVeg }),
      ...(isAvailable !== undefined && { isAvailable }),
      ...(taxRateId !== undefined && { taxRateId: taxRateId || null }),
    });

    const updated = await MenuItem.findByPk(item.id, { include: itemIncludes });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteItem(req, res, next) {
  try {
    const item = await MenuItem.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!item) return res.status(404).json({ message: "Item not found" });
    await item.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function uploadItemImage(req, res, next) {
  try {
    const item = await MenuItem.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!req.file) return res.status(400).json({ message: "image file is required" });

    const imageUrl = `/uploads/${path.basename(req.file.path)}`;
    await item.update({ imageUrl });
    res.json({ imageUrl });
  } catch (err) {
    next(err);
  }
}

// -- Variants --

async function addVariant(req, res, next) {
  try {
    const item = await MenuItem.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const { name, price, isDefault } = req.body;
    if (!name || price === undefined) return res.status(400).json({ message: "name and price are required" });

    const variant = await ItemVariant.create({ menuItemId: item.id, name, price, isDefault: !!isDefault });
    res.status(201).json(variant);
  } catch (err) {
    next(err);
  }
}

async function updateVariant(req, res, next) {
  try {
    const variant = await ItemVariant.findOne({
      where: { id: req.params.variantId, menuItemId: req.params.id },
      include: [{ model: MenuItem, as: "menuItem", where: { vendorId: req.vendorId } }],
    });
    if (!variant) return res.status(404).json({ message: "Variant not found" });

    const { name, price, isDefault } = req.body;
    await variant.update({
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price }),
      ...(isDefault !== undefined && { isDefault }),
    });
    res.json(variant);
  } catch (err) {
    next(err);
  }
}

async function deleteVariant(req, res, next) {
  try {
    const variant = await ItemVariant.findOne({
      where: { id: req.params.variantId, menuItemId: req.params.id },
      include: [{ model: MenuItem, as: "menuItem", where: { vendorId: req.vendorId } }],
    });
    if (!variant) return res.status(404).json({ message: "Variant not found" });
    await variant.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// -- Addons --

async function addAddon(req, res, next) {
  try {
    const item = await MenuItem.findOne({ where: { id: req.params.id, vendorId: req.vendorId } });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const { name, price } = req.body;
    if (!name || price === undefined) return res.status(400).json({ message: "name and price are required" });

    const addon = await ItemAddon.create({ menuItemId: item.id, name, price });
    res.status(201).json(addon);
  } catch (err) {
    next(err);
  }
}

async function updateAddon(req, res, next) {
  try {
    const addon = await ItemAddon.findOne({
      where: { id: req.params.addonId, menuItemId: req.params.id },
      include: [{ model: MenuItem, as: "menuItem", where: { vendorId: req.vendorId } }],
    });
    if (!addon) return res.status(404).json({ message: "Addon not found" });

    const { name, price, isActive } = req.body;
    await addon.update({
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price }),
      ...(isActive !== undefined && { isActive }),
    });
    res.json(addon);
  } catch (err) {
    next(err);
  }
}

async function deleteAddon(req, res, next) {
  try {
    const addon = await ItemAddon.findOne({
      where: { id: req.params.addonId, menuItemId: req.params.id },
      include: [{ model: MenuItem, as: "menuItem", where: { vendorId: req.vendorId } }],
    });
    if (!addon) return res.status(404).json({ message: "Addon not found" });
    await addon.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  uploadItemImage,
  addVariant,
  updateVariant,
  deleteVariant,
  addAddon,
  updateAddon,
  deleteAddon,
};
