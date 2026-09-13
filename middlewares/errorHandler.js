const logger = require("../utils/logger");

function notFound(req, res) {
  logger.warn("route.not_found", { method: req.method, url: req.originalUrl });
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  // Context that makes a log line actually useful for tracing a bug back to
  // "who did what" -- which vendor, which user, which route -- instead of
  // just a bare message + stack. req.user/req.vendorId may not be set yet if
  // the error happened before auth/tenantScope ran (e.g. a bad login).
  const context = {
    method: req.method,
    url: req.originalUrl,
    status,
    vendorId: req.vendorId || req.user?.vendorId,
    userId: req.user?.id,
    role: req.user?.role?.name,
  };

  // Expected client errors (bad input, a blocked transition, a 404) are
  // normal traffic, not incidents -- logging them at "error" would bury the
  // handful of real 500s a shift actually needs investigated under a wall of
  // routine 400s. Only genuine server-side failures go to error.log.
  if (status >= 500) {
    logger.error(err.message, { ...context, stack: err.stack });
  } else {
    logger.warn(err.message, context);
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({ message: "A record with these details already exists" });
  }
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({ message: err.errors.map((e) => e.message).join(", ") });
  }

  res.status(status).json({ message: status === 500 ? "Internal server error" : err.message });
}

module.exports = { notFound, errorHandler };
