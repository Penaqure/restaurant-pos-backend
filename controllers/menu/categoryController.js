const { MenuCategory, MenuItem } = require("../../models");
const logger = require("../../utils/logger");

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

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
