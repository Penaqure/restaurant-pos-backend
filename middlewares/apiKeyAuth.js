// Service-to-service auth for the inventory system's read-only integration
// -- a shared secret in a header, not a user JWT, since nobody is logging in.
// Scopes every request to the one vendor this key is provisioned for
// (INVENTORY_INTEGRATION_VENDOR_ID), same as req.vendorId elsewhere in this
// app, so downstream controllers don't need to know this is a different
// auth scheme at all.
function apiKeyAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.INVENTORY_INTEGRATION_API_KEY) {
    return res.status(401).json({ message: "Invalid or missing API key" });
  }
  req.vendorId = process.env.INVENTORY_INTEGRATION_VENDOR_ID;
  next();
}

module.exports = apiKeyAuth;
