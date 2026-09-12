const express = require("express");
const reportController = require("../controllers/reports/reportController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/summary", authorizeRoles(ROLES.OWNER, ROLES.MANAGER), reportController.getSummary);
router.get("/analytics", authorizeRoles(ROLES.OWNER, ROLES.MANAGER), reportController.getAnalytics);
// Scoped to req.user.id inside the controller -- safe for any authenticated
// role, since it can never surface another user's or the vendor's data.
router.get("/my-activity", reportController.getMyActivity);

module.exports = router;
