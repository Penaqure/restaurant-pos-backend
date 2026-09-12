const express = require("express");
const { getPublicMenu, createPublicOrder } = require("../controllers/public/publicOrderController");

// Deliberately no `protect`/`tenantScope` here -- this is the one surface in
// the API meant to be called by an anonymous customer's phone after
// scanning a table's QR code. Every handler resolves its own vendor/branch
// from the scanned tableId; nothing here trusts a caller-supplied vendorId.
const router = express.Router();

router.get("/menu/:tableId", getPublicMenu);
router.post("/orders", createPublicOrder);

module.exports = router;
