const express = require("express");
const apiKeyAuth = require("../middlewares/apiKeyAuth");
const integrationController = require("../controllers/integration/integrationController");

const router = express.Router();

router.use(apiKeyAuth);

router.get("/menu-items", integrationController.listMenuItems);
router.get("/sales-summary", integrationController.getSalesSummary);

module.exports = router;
