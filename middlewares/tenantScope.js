// Establishes req.vendorId for every vendor-scoped route. Must run after `protect`.
//
// Controllers must always filter by { id, vendorId: req.vendorId } (and branchId
// where applicable) rather than by id alone -- that turns a cross-tenant lookup
// into a plain 404 instead of relying on every query remembering a WHERE clause.
function tenantScope(req, res, next) {
  const user = req.user;

  if (!user.vendorId) {
    // Platform super_admin: only allowed onto vendor routes via an explicit override header.
    const overrideVendorId = req.headers["x-vendor-id"];
    if (!overrideVendorId) {
      return res.status(403).json({ message: "Vendor context required" });
    }
    req.vendorId = overrideVendorId;
    req.branchId = req.headers["x-branch-id"] || null;
    return next();
  }

  req.vendorId = user.vendorId;
  // Owner/manager have branchId === null (all-branch access); staff are pinned to one branch.
  req.branchId = user.branchId || req.headers["x-branch-id"] || null;
  next();
}

module.exports = { tenantScope };
