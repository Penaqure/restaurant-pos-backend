const express = require("express");
const discountController = require("../controllers/billing/discountController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

const canManage = authorizeRoles(ROLES.OWNER, ROLES.MANAGER);
const canRead = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER);

router.get("/", canRead, discountController.listDiscounts);
router.post("/", canManage, discountController.createDiscount);
router.patch("/:id", canManage, discountController.updateDiscount);
router.delete("/:id", canManage, discountController.deleteDiscount);

module.exports = router;
