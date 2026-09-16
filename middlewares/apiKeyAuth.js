const crypto = require("crypto");

// Service-to-service auth for the inventory system's read-only integration
// -- a shared secret in a header, not a user JWT, since nobody is logging in.
// Scopes every request to the one vendor this key is provisioned for
// (INVENTORY_INTEGRATION_VENDOR_ID), same as req.vendorId elsewhere in this
// app, so downstream controllers don't need to know this is a different
// auth scheme at all.
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Comparing unequal-length buffers directly would either throw or return
  // early, both of which leak length via timing -- so a fixed-length dummy
  // comparison always runs first regardless of how the real one turns out.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function apiKeyAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  const expected = process.env.INVENTORY_INTEGRATION_API_KEY;
  if (typeof key !== "string" || !expected || !timingSafeEqualStrings(key, expected)) {
    return res.status(401).json({ message: "Invalid or missing API key" });
  }
  req.vendorId = process.env.INVENTORY_INTEGRATION_VENDOR_ID;
  next();
}

module.exports = apiKeyAuth;
