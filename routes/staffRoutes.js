const express = require("express");
const { listStaff, createStaff, updateStaff } = require("../controllers/vendor/staffController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", authorizeRoles(ROLES.OWNER, ROLES.MANAGER), listStaff);
router.post("/", authorizeRoles(ROLES.OWNER, ROLES.MANAGER), createStaff);
router.patch("/:id", authorizeRoles(ROLES.OWNER, ROLES.MANAGER), updateStaff);

module.exports = router;
