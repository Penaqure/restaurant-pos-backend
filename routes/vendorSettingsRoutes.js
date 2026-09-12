const express = require("express");
const { getBillingSettings, updateBillingSettings } = require("../controllers/vendor/vendorSettingsController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope, authorizeRoles(ROLES.OWNER));

router.get("/billing", getBillingSettings);
router.patch("/billing", updateBillingSettings);

module.exports = router;
