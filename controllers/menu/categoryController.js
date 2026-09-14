const { MenuCategory, MenuItem } = require("../../models");
const logger = require("../../utils/logger");
const { parseImportFile, toBoolean, toInt } = require("../../services/menuImportService");

async function listCategories(req, res, next) {
  try {
    const categories = await MenuCategory.findAll({
      where: { vendorId: req.vendorId },
      order: [["sortOrder", "ASC"]],
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const { name, description, sortOrder } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const category = await MenuCategory.create({
      vendorId: req.vendorId,
      name,
      description,
      sortOrder: sortOrder ?? 0,
    });
    logger.info("menu_category.created", { vendorId: req.vendorId, userId: req.user.id, categoryId: category.id, name });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await MenuCategory.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
    });
    if (!category) return res.status(404).json({ message: "Category not found" });

    const { name, description, sortOrder, isActive } = req.body;
    await category.update({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    });
    logger.info("menu_category.updated", { vendorId: req.vendorId, userId: req.user.id, categoryId: category.id });
    res.json(category);
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const category = await MenuCategory.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
    });
    if (!category) return res.status(404).json({ message: "Category not found" });

    const itemCount = await MenuItem.count({ where: { categoryId: category.id } });
    if (itemCount > 0) {
      return res.status(409).json({ message: "Move or delete items in this category first" });
    }

    await category.destroy();
    logger.info("menu_category.deleted", { vendorId: req.vendorId, userId: req.user.id, categoryId: category.id, name: category.name });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Bulk-creates/updates categories from an uploaded CSV or JSON file.
// Expected columns: name (required), description, sortOrder, isActive.
// A row whose name matches an existing category (case-insensitive) updates
// that category instead of creating a duplicate.
async function importCategories(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "file is required" });

    let rows;
    try {
      rows = parseImportFile(req.file);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const existing = await MenuCategory.findAll({ where: { vendorId: req.vendorId } });
    const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

    const result = { totalRows: rows.length, created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header is row 1
      const row = rows[i];
      const name = (row.name || "").toString().trim();

      if (!name) {
        result.errors.push({ row: rowNum, message: "name is required" });
        continue;
      }

      const payload = {
        vendorId: req.vendorId,
        name,
        description: row.description ? String(row.description).trim() : null,
        sortOrder: toInt(row.sortOrder, 0),
        isActive: toBoolean(row.isActive, true),
      };

      const key = name.toLowerCase();
      const match = byName.get(key);
      if (match) {
        await match.update(payload);
        result.updated += 1;
      } else {
        const created = await MenuCategory.create(payload);
        byName.set(key, created);
        result.created += 1;
      }
    }

    logger.info("menu_category.imported", {
      vendorId: req.vendorId,
      userId: req.user.id,
      created: result.created,
      updated: result.updated,
      errors: result.errors.length,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, importCategories };
