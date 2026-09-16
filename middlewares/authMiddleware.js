const jwt = require("jsonwebtoken");
const { User, Role, Vendor, Branch } = require("../models");

// Verifies the JWT, loads the current user + role, and attaches them to req.
async function protect(req, res, next) {
  try {
    // The browser client rides the httpOnly cookie set at login; a bare
    // Authorization header stays supported for non-browser API callers
    // (Postman, scripts) that can't hold a cookie jar.
    const header = req.headers.authorization || "";
    const token = req.cookies?.billing_token || (header.startsWith("Bearer ") ? header.slice(7) : null);
    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Pinning the algorithm stops a token forged with alg:"none" or a
    // different algorithm than the one this server actually signs with
    // from being accepted, regardless of what the token's own header claims.
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

    const user = await User.findByPk(payload.id, {
      include: [
        { model: Role, as: "role" },
        { model: Vendor, as: "vendor" },
        { model: Branch, as: "branch" },
      ],
    });

    if (!user || user.status !== "active") {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // A vendor disabled after this user's token was issued must still cut
    // off access immediately, not just block their next login.
    if (user.vendor && !user.vendor.isActive) {
      return res.status(401).json({ message: "This restaurant's account has been disabled" });
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { protect };
