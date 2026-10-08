const express = require("express");
const { listAuditLog } = require("../controllers/vendor/auditLogController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

// Owner-only -- this is the trail an owner reaches for when a bill or
// staff change needs explaining; managers/cashiers don't get visibility
// into each other's actions this way.
router.get("/", authorizeRoles(ROLES.OWNER), listAuditLog);

module.exports = router;
