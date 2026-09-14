require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");

const requestLogger = require("./middlewares/requestLogger");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
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
const sequelize = require("./config/db");
const logger = require("./utils/logger");
const notificationService = require("./services/notificationService");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());
app.use(requestLogger);
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

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

sequelize
  .authenticate()
  .then(() => {
    logger.info("Database connection established");
    notificationService.init(server);
    server.listen(PORT, () => logger.info(`Server listening on port ${PORT}`));
  })
  .catch((err) => {
    logger.error("Unable to connect to the database", { error: err.message });
    process.exit(1);
  });

module.exports = app;
