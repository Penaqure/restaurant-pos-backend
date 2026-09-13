const winston = require("winston");
const path = require("path");

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // This install runs unattended on a shop's own machine (see README) with
    // no one watching disk usage, and every controller now logs a line per
    // mutation plus morgan's per-request access log -- without a cap these
    // grow forever and can eventually fill the disk. 10MB x 5 files per log
    // (50MB max) keeps recent history without that risk.
    new winston.transports.File({
      filename: path.join(__dirname, "..", "logs", "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "..", "logs", "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
