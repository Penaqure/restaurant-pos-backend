const express = require("express");
const {
  createVendor,
  listVendors,
  getVendor,
  updateVendor,
  deleteVendor,
  uploadVendorLogo,
} = require("../controllers/platform/vendorController");
const planController = require("../controllers/platform/planController");
const { protect } = require("../middlewares/authMiddleware");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");
const upload = require("../middlewares/upload");

const router = express.Router();

router.use(protect, authorizeRoles(ROLES.SUPER_ADMIN));

router.post("/vendors", createVendor);
router.get("/vendors", listVendors);
router.get("/vendors/:id", getVendor);
router.patch("/vendors/:id", updateVendor);
router.delete("/vendors/:id", deleteVendor);
router.post("/vendors/:id/logo", upload.single("logo"), uploadVendorLogo);

router.get("/plans", planController.listPlans);
router.post("/plans", planController.createPlan);
router.patch("/plans/:id", planController.updatePlan);
router.delete("/plans/:id", planController.deletePlan);

module.exports = router;
