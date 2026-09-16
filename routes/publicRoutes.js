const express = require("express");
const { getPublicMenu, createPublicOrder } = require("../controllers/public/publicOrderController");
const { publicMenuLimiter, publicOrderLimiter } = require("../middlewares/rateLimiters");

// Deliberately no `protect`/`tenantScope` here -- this is the one surface in
// the API meant to be called by an anonymous customer's phone after
// scanning a table's QR code. Every handler resolves its own vendor/branch
// from the scanned tableId; nothing here trusts a caller-supplied vendorId.
// Both routes are rate-limited per IP since neither requires a login.
const router = express.Router();

router.get("/menu/:tableId", publicMenuLimiter, getPublicMenu);
router.post("/orders", publicOrderLimiter, createPublicOrder);

module.exports = router;
