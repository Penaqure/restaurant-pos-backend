const express = require("express");
const tableController = require("../controllers/tables/tableController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

const canManageTables = authorizeRoles(ROLES.OWNER, ROLES.MANAGER);
const canRead = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER);

router.get("/", canRead, tableController.listTables);
router.post("/", canManageTables, tableController.createTable);
router.patch("/:id", canRead, tableController.updateTable); // waiters/cashiers flip status too
router.delete("/:id", canManageTables, tableController.deleteTable);

module.exports = router;
