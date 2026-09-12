const jwt = require("jsonwebtoken");
const { User, Role, Vendor, Branch } = require("../models");

// Verifies the JWT, loads the current user + role, and attaches them to req.
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

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
