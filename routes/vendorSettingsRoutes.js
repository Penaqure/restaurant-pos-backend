const express = require("express");
const {
  getBillingSettings,
  updateBillingSettings,
  getBrandingSettings,
  updateBrandingSettings,
  uploadLogo,
} = require("../controllers/vendor/vendorSettingsController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");
const upload = require("../middlewares/upload");

const router = express.Router();

router.use(protect, tenantScope, authorizeRoles(ROLES.OWNER));

router.get("/billing", getBillingSettings);
router.patch("/billing", updateBillingSettings);

router.get("/branding", getBrandingSettings);
router.patch("/branding", updateBrandingSettings);
router.post("/branding/logo", upload.single("logo"), uploadLogo);

module.exports = router;
