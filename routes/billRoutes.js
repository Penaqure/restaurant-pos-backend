const express = require("express");
const billController = require("../controllers/billing/billController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

// Per the RBAC matrix, cashiers generate/view bills too; waiters do not.
const canBill = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER);

router.get("/", canBill, billController.listBills);
router.get("/:id", canBill, billController.getBill);
router.get("/:id/pdf", canBill, billController.getBillPdf);
router.post("/from-order/:orderId", canBill, billController.generateBillFromOrder);

module.exports = router;
