const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const logger = require("../utils/logger");

let io = null;

// Every connected staff member joins a room for their vendor (everyone) and
// a room for their vendor+role, so an event can be restricted to only the
// roles that could actually open its linked page -- a waiter's socket never
// even receives a payment amount, rather than receiving it and hiding it
// client-side.
function vendorRoom(vendorId) {
  return `vendor:${vendorId}`;
}
function roleRoom(vendorId, roleName) {
  return `vendor:${vendorId}:role:${roleName}`;
}

function init(httpServer, frontendUrl) {
  io = new Server(httpServer, {
    cors: { origin: frontendUrl || process.env.FRONTEND_URL, credentials: true },
  });

  // Lightweight auth: verifies the same JWT issued at login, without a DB
  // round-trip per connection. A user deactivated or a vendor disabled after
  // the socket connects stays connected until the token expires or the page
  // reloads -- the REST API (which does check on every request) remains the
  // source of truth for access control.
  //
  // The token itself now lives only in the httpOnly `billing_token` cookie
  // (see authController/authMiddleware), so it's read the same way here --
  // off the handshake request's Cookie header -- rather than a client-
  // supplied `auth.token`, which would require page JS to hold the token.
  io.use((socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const token = cookies.billing_token;
      if (!token) return next(new Error("Not authenticated"));
      const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      if (!payload.vendorId) return next(new Error("Not authenticated"));
      socket.vendorId = payload.vendorId;
      socket.userId = payload.id;
      socket.roleName = payload.roleName;
      next();
    } catch {
      next(new Error("Not authenticated"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(vendorRoom(socket.vendorId));
    if (socket.roleName) socket.join(roleRoom(socket.vendorId, socket.roleName));
  });

  logger.info("notifications.socket_ready");
}

function emitToVendor(vendorId, event, payload) {
  if (!io || !vendorId) return;
  io.to(vendorRoom(vendorId)).emit(event, payload);
}

// Restricts an event to the roles whose REST access actually covers its
// linked page, so it mirrors the same authorizeRoles(...) gate that page's
// route uses (see billRoutes/menuRoutes/orderRoutes for the matrix this
// tracks).
function emitToRoles(vendorId, roles, event, payload) {
  if (!io || !vendorId || roles.length === 0) return;
  io.to(roles.map((role) => roleRoom(vendorId, role))).emit(event, payload);
}

const LOW_AVAILABILITY_THRESHOLD = 0.8;
const LOW_AVAILABILITY_DEBOUNCE_MS = 5 * 60 * 1000;
// branchId -> ms timestamp of the last "tables running low" notice, so a
// busy service period doesn't re-fire this on every single order placed.
const lastLowAvailabilityNotice = new Map();

async function checkLowTableAvailability({ vendorId, branchId, actorUserId }) {
  if (!io || !branchId) return;
  try {
    // Required here (not at module load) to avoid a require cycle with
    // models/index.js, which never itself touches services/.
    const { RestaurantTable } = require("../models");
    const [total, occupied] = await Promise.all([
      RestaurantTable.count({ where: { vendorId, branchId } }),
      RestaurantTable.count({ where: { vendorId, branchId, status: "occupied" } }),
    ]);
    if (total === 0) return;

    const ratio = occupied / total;
    if (ratio < LOW_AVAILABILITY_THRESHOLD) return;

    const last = lastLowAvailabilityNotice.get(branchId) || 0;
    if (Date.now() - last < LOW_AVAILABILITY_DEBOUNCE_MS) return;
    lastLowAvailabilityNotice.set(branchId, Date.now());

    emitToVendor(vendorId, "tables:low_availability", {
      branchId,
      occupied,
      total,
      availableCount: total - occupied,
      actorUserId,
    });
  } catch (err) {
    logger.error("notifications.low_availability_check_failed", { vendorId, branchId, error: err.message });
  }
}

module.exports = { init, emitToVendor, emitToRoles, checkLowTableAvailability };
