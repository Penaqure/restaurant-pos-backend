const { Vendor } = require("../models");

// Establishes req.vendorId for every vendor-scoped route. Must run after `protect`.
//
// Controllers must always filter by { id, vendorId: req.vendorId } (and branchId
// where applicable) rather than by id alone -- that turns a cross-tenant lookup
// into a plain 404 instead of relying on every query remembering a WHERE clause.
async function tenantScope(req, res, next) {
  try {
    const user = req.user;

    if (!user.vendorId) {
      // Platform super_admin: only allowed onto vendor routes via an explicit override header.
      const overrideVendorId = req.headers["x-vendor-id"];
      if (!overrideVendorId) {
        return res.status(403).json({ message: "Vendor context required" });
      }
      // The header is caller-supplied, so it's validated against a real
      // vendor before anything downstream trusts it as req.vendorId.
      const vendor = await Vendor.findByPk(overrideVendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      req.vendorId = overrideVendorId;
      req.branchId = req.headers["x-branch-id"] || null;
      return next();
    }

    req.vendorId = user.vendorId;
    // Owner/manager have branchId === null (all-branch access); staff are pinned to one branch.
    req.branchId = user.branchId || req.headers["x-branch-id"] || null;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantScope };
