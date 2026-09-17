require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");

const requestLogger = require("./middlewares/requestLogger");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiters");
const authRoutes = require("./routes/authRoutes");
const platformRoutes = require("./routes/platformRoutes");
const staffRoutes = require("./routes/staffRoutes");
const roleRoutes = require("./routes/roleRoutes");
const menuRoutes = require("./routes/menuRoutes");
const tableRoutes = require("./routes/tableRoutes");
const orderRoutes = require("./routes/orderRoutes");
const branchRoutes = require("./routes/branchRoutes");
const billRoutes = require("./routes/billRoutes");
const discountRoutes = require("./routes/discountRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const reportRoutes = require("./routes/reportRoutes");
const vendorSettingsRoutes = require("./routes/vendorSettingsRoutes");
const publicRoutes = require("./routes/publicRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const sequelize = require("./config/db");
const logger = require("./utils/logger");
const notificationService = require("./services/notificationService");
const pdfService = require("./services/pdfService");

// Fail fast rather than silently running with a forgeable/absent secret --
// a weak JWT_SECRET lets an attacker mint a valid token for any user,
// including a platform super_admin.
const PLACEHOLDER_JWT_SECRET = "change-this-to-a-long-random-string";
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET === PLACEHOLDER_JWT_SECRET
) {
  throw new Error(
    "JWT_SECRET is missing, too short, or still the placeholder from .env.example. " +
      "Set it to a long random value (e.g. `node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"`) before starting the server."
  );
}

// Same fail-closed posture for CORS -- "*" would let any website's JS read
// authenticated responses via credentialed requests, and browsers reject
// "*" combined with credentials anyway, so a real origin is required.
const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? null : "http://localhost:3000");
if (!FRONTEND_URL) {
  throw new Error("FRONTEND_URL must be set in production (used for CORS + cookie scoping).");
}

const app = express();

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);
app.use("/api", apiLimiter);
app.use("/uploads", express.static(path.join(__dirname, process.env.UPLOAD_DIR || "public/uploads")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/vendor-settings", vendorSettingsRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/integrations", integrationRoutes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

sequelize
  .authenticate()
  .then(() => {
    logger.info("Database connection established");
    notificationService.init(server, FRONTEND_URL);
    server.listen(PORT, () => logger.info(`Server listening on port ${PORT}`));
  })
  .catch((err) => {
    logger.error("Unable to connect to the database", { error: err.message });
    process.exit(1);
  });

// pdfService now keeps one Chromium process alive across requests (see its
// comments) instead of launching a fresh one per PDF -- close it explicitly
// on a graceful stop (`docker compose down`/`restart` sends SIGTERM) rather
// than leaving it to be force-killed alongside the process.
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  await pdfService.closeBrowser();
  server.close(() => process.exit(0));
  // Belt and suspenders: if something's still holding a connection open
  // (e.g. a slow request), don't hang forever waiting for server.close().
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
