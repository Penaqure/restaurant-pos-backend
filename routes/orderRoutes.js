const express = require("express");
const orderController = require("../controllers/orders/orderController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

// Per the RBAC matrix, every front-of-house role can create/update orders.
const canOrder = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER);
// Kitchen only views orders and moves them through the prep pipeline -- it
// never creates an order or touches billing.
const canView = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN);
const canUpdateStatus = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN);

router.get("/", canView, orderController.listOrders);
router.get("/:id", canView, orderController.getOrder);
router.post("/", canOrder, orderController.createOrder);
router.post("/:id/items", canOrder, orderController.addItemsToOrder);
router.patch("/:id/status", canUpdateStatus, orderController.updateOrderStatus);
router.patch("/:id/table", canOrder, orderController.transferTable);

module.exports = router;
