const express = require("express");
const paymentController = require("../controllers/payments/paymentController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

// Matches the RBAC matrix: owner/manager/cashier record payments, waiters don't.
const canPay = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER);

router.get("/", canPay, paymentController.listPayments);
router.post("/", canPay, paymentController.recordPayment);
router.delete("/:id", canPay, paymentController.voidPayment);

module.exports = router;
