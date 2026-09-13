const express = require("express");
const tableController = require("../controllers/tables/tableController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

const canManageTables = authorizeRoles(ROLES.OWNER, ROLES.MANAGER);
const canUpdateStatus = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER);
// Kitchen can see tables (name/location) to make sense of orders table-wise, but never edits them.
const canRead = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN);

router.get("/", canRead, tableController.listTables);
router.post("/", canManageTables, tableController.createTable);
router.patch("/:id", canUpdateStatus, tableController.updateTable); // waiters/cashiers flip status too
router.delete("/:id", canManageTables, tableController.deleteTable);

module.exports = router;
