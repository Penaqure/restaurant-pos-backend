const path = require("path");
const { sequelize, MenuItem, MenuCategory, TaxRate, ItemVariant, ItemAddon } = require("../../models");
const logger = require("../../utils/logger");
const { parseImportFile, toBoolean, toDecimal, toInt } = require("../../services/menuImportService");

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

    logger.info("menu_item.created", { vendorId: req.vendorId, userId: req.user.id, itemId: item.id, name });

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

    logger.info("menu_item.updated", { vendorId: req.vendorId, userId: req.user.id, itemId: item.id });

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
    logger.info("menu_item.deleted", { vendorId: req.vendorId, userId: req.user.id, itemId: item.id, name: item.name });
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

// Bulk-creates/updates menu items from an uploaded CSV or JSON file.
// Expected columns: category (name, required), name (required),
// description, basePrice (required), isVeg, isAvailable, sortOrder,
// taxRate (name, optional). Categories and tax rates referenced by name
// that don't already exist are looked up per-vendor; unknown categories
// are auto-created, unknown tax rates are reported as row errors.
// A row whose category+name matches an existing item (case-insensitive)
// updates that item instead of creating a duplicate.
async function importItems(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "file is required" });

    let rows;
    try {
      rows = parseImportFile(req.file);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const [categories, taxRates, items] = await Promise.all([
      MenuCategory.findAll({ where: { vendorId: req.vendorId } }),
      TaxRate.findAll({ where: { vendorId: req.vendorId } }),
      MenuItem.findAll({ where: { vendorId: req.vendorId } }),
    ]);

    const categoriesByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
    const taxRatesByName = new Map(taxRates.map((t) => [t.name.trim().toLowerCase(), t]));
    const itemsByKey = new Map(items.map((i) => [`${i.categoryId}::${i.name.trim().toLowerCase()}`, i]));

    const result = { totalRows: rows.length, created: 0, updated: 0, categoriesCreated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header is row 1
      const row = rows[i];
      const categoryName = (row.category || "").toString().trim();
      const name = (row.name || "").toString().trim();
      const basePrice = toDecimal(row.basePrice);

      if (!categoryName) {
        result.errors.push({ row: rowNum, message: "category is required" });
        continue;
      }
      if (!name) {
        result.errors.push({ row: rowNum, message: "name is required" });
        continue;
      }
      if (basePrice === null) {
        result.errors.push({ row: rowNum, message: "basePrice is required and must be a number" });
        continue;
      }

      let category = categoriesByName.get(categoryName.toLowerCase());
      if (!category) {
        category = await MenuCategory.create({ vendorId: req.vendorId, name: categoryName });
        categoriesByName.set(categoryName.toLowerCase(), category);
        result.categoriesCreated += 1;
      }

      let taxRateId = null;
      const taxRateName = (row.taxRate || "").toString().trim();
      if (taxRateName) {
        const taxRate = taxRatesByName.get(taxRateName.toLowerCase());
        if (!taxRate) {
          result.errors.push({ row: rowNum, message: `Unknown taxRate "${taxRateName}"` });
          continue;
        }
        taxRateId = taxRate.id;
      }

      const payload = {
        vendorId: req.vendorId,
        categoryId: category.id,
        name,
        description: row.description ? String(row.description).trim() : null,
        basePrice,
        isVeg: toBoolean(row.isVeg, true),
        isAvailable: toBoolean(row.isAvailable, true),
        sortOrder: toInt(row.sortOrder, 0),
        taxRateId,
      };

      const key = `${category.id}::${name.toLowerCase()}`;
      const match = itemsByKey.get(key);
      if (match) {
        await match.update(payload);
        result.updated += 1;
      } else {
        const created = await MenuItem.create(payload);
        itemsByKey.set(key, created);
        result.created += 1;
      }
    }

    logger.info("menu_item.imported", {
      vendorId: req.vendorId,
      userId: req.user.id,
      created: result.created,
      updated: result.updated,
      categoriesCreated: result.categoriesCreated,
      errors: result.errors.length,
    });

    res.json(result);
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
  importItems,
};
