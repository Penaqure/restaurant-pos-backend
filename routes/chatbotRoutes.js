const express = require("express");
const { questions, ask } = require("../controllers/chatbot/chatbotController");
const { protect } = require("../middlewares/authMiddleware");
const { tenantScope } = require("../middlewares/tenantScope");
const { authorizeRoles } = require("../middlewares/rbac");
const { chatbotLimiter } = require("../middlewares/rateLimiters");
const { ROLES } = require("../config/constants");

const router = express.Router();

router.use(protect, tenantScope);

// Owner/manager only -- every answer is a business figure (sales, refunds,
// outstanding balances), the same boundary reportRoutes.js draws around
// /reports. Pure DB lookups otherwise, scoped to the asker's own
// vendor/branch -- no external calls, so no opt-in flag is needed the way
// the kitchen printer or anything internet-facing would need one.
router.use(authorizeRoles(ROLES.OWNER, ROLES.MANAGER));
router.get("/questions", questions);
router.post("/ask", chatbotLimiter, ask);

module.exports = router;
