const logger = require("../utils/logger");

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack });

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({ message: "A record with these details already exists" });
  }
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({ message: err.errors.map((e) => e.message).join(", ") });
  }

  const status = err.status || 500;
  res.status(status).json({ message: status === 500 ? "Internal server error" : err.message });
}

module.exports = { notFound, errorHandler };
