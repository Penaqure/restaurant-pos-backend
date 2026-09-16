const rateLimit = require("express-rate-limit");

function limiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
    ...options,
  });
}

// Defense-in-depth baseline on every /api route.
const apiLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 300 });

// Brute-force guard: independent of the global limiter, keyed the same way
// (per IP) but much tighter since a login attempt is the highest-value
// target on this API.
const loginLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 10 });

// Anonymous QR-menu browsing -- generous, since one customer's phone can
// legitimately re-fetch the menu a few times while looking at it.
const publicMenuLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

// Anonymous order placement -- writes to the DB, so stricter than menu
// browsing to blunt spam/DoS from a single table's QR link.
const publicOrderLimiter = limiter({ windowMs: 60 * 1000, limit: 10 });

module.exports = { apiLimiter, loginLimiter, publicMenuLimiter, publicOrderLimiter };
