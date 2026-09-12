const express = require("express");
const orderController = require("../controllers/orders/orderController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

// Per the RBAC matrix, every staff role can create/update orders.
const canOrder = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER);

router.get("/", canOrder, orderController.listOrders);
router.get("/:id", canOrder, orderController.getOrder);
router.post("/", canOrder, orderController.createOrder);
router.patch("/:id/status", canOrder, orderController.updateOrderStatus);

module.exports = router;
