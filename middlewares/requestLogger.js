const morgan = require("morgan");
const logger = require("../utils/logger");

const stream = { write: (message) => logger.info(message.trim()) };

module.exports = morgan("combined", { stream });
