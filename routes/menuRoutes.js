const path = require("path");
const express = require("express");
const categoryController = require("../controllers/menu/categoryController");
const menuItemController = require("../controllers/menu/menuItemController");
const taxRateController = require("../controllers/menu/taxRateController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");
const upload = require("../middlewares/upload");
const uploadData = require("../middlewares/uploadData");

const router = express.Router();

function sendSampleFile(basename) {
  return (req, res) => {
    const ext = req.query.format === "json" ? "json" : "csv";
    res.download(path.join(__dirname, "..", "templates", "samples", `${basename}.${ext}`));
  };
}

router.use(protect, tenantScope);

// Menu management is restricted to owner/manager; everyone on staff can read
// it (needed by the POS screen in Phase 3).
const canManageMenu = authorizeRoles(ROLES.OWNER, ROLES.MANAGER);
const canRead = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER);

router.get("/categories", canRead, categoryController.listCategories);
router.post("/categories", canManageMenu, categoryController.createCategory);
router.patch("/categories/:id", canManageMenu, categoryController.updateCategory);
router.delete("/categories/:id", canManageMenu, categoryController.deleteCategory);
router.post("/categories/import", canManageMenu, uploadData.single("file"), categoryController.importCategories);
router.get("/categories/import/sample", canRead, sendSampleFile("menu-categories-sample"));

router.get("/tax-rates", canRead, taxRateController.listTaxRates);
router.post("/tax-rates", canManageMenu, taxRateController.createTaxRate);
router.patch("/tax-rates/:id", canManageMenu, taxRateController.updateTaxRate);
router.delete("/tax-rates/:id", canManageMenu, taxRateController.deleteTaxRate);

router.get("/items", canRead, menuItemController.listItems);
router.get("/items/:id", canRead, menuItemController.getItem);
router.post("/items", canManageMenu, menuItemController.createItem);
router.patch("/items/:id", canManageMenu, menuItemController.updateItem);
router.delete("/items/:id", canManageMenu, menuItemController.deleteItem);
router.post("/items/:id/image", canManageMenu, upload.single("image"), menuItemController.uploadItemImage);
router.post("/items/import", canManageMenu, uploadData.single("file"), menuItemController.importItems);
router.get("/items/import/sample", canRead, sendSampleFile("menu-items-sample"));

router.post("/items/:id/variants", canManageMenu, menuItemController.addVariant);
router.patch("/items/:id/variants/:variantId", canManageMenu, menuItemController.updateVariant);
router.delete("/items/:id/variants/:variantId", canManageMenu, menuItemController.deleteVariant);

router.post("/items/:id/addons", canManageMenu, menuItemController.addAddon);
router.patch("/items/:id/addons/:addonId", canManageMenu, menuItemController.updateAddon);
router.delete("/items/:id/addons/:addonId", canManageMenu, menuItemController.deleteAddon);

module.exports = router;
