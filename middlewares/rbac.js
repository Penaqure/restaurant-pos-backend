// Restricts a route to a fixed set of role names. Must run after `protect`.
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const roleName = req.user?.role?.name;
    if (!roleName || !allowedRoles.includes(roleName)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

module.exports = { authorizeRoles };
