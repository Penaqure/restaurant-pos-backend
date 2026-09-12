const express = require("express");
const { listRoles } = require("../controllers/vendor/roleController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", authorizeRoles(ROLES.OWNER, ROLES.MANAGER), listRoles);

module.exports = router;
