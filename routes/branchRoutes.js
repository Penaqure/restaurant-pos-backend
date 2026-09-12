const express = require("express");
const branchController = require("../controllers/vendor/branchController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

router.get("/", authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER), branchController.listBranches);
router.post("/", authorizeRoles(ROLES.OWNER), branchController.createBranch);
router.patch("/:id", authorizeRoles(ROLES.OWNER), branchController.updateBranch);
router.delete("/:id", authorizeRoles(ROLES.OWNER), branchController.deleteBranch);

module.exports = router;
