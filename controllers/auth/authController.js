const jwt = require("jsonwebtoken");
const { User, Role, Vendor, SubscriptionPlan, Branch } = require("../../models");
const logger = require("../../utils/logger");

const COOKIE_NAME = "billing_token";
// jsonwebtoken's `expiresIn` accepts "1d"/"12h"/etc; the cookie needs the
// same lifetime in milliseconds, so a small set of units is parsed by hand
// rather than pulling in a duration-parsing dependency for this one value.
function expiresInMs(raw) {
  const match = /^(\d+)([smhd])$/.exec(raw || "1d");
  if (!match) return 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[match[2]];
  return value * unitMs;
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      vendorId: user.vendorId,
      branchId: user.branchId,
      roleId: user.roleId,
      roleName: user.role.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

// httpOnly so the token is never reachable from page JS -- closes off the
// XSS-token-theft path a readable cookie/localStorage would leave open.
// SameSite=Lax is enough since frontend and backend share a host (only the
// port differs) in this deployment, per docker-compose.yml.
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: expiresInMs(process.env.JWT_EXPIRES_IN),
    path: "/",
  });
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.scope("withPassword").findOne({
      where: { email: email.toLowerCase() },
      include: [
        { model: Role, as: "role" },
        { model: Vendor, as: "vendor" },
      ],
    });

    // Verify identity before revealing anything about account/vendor status,
    // so a guess against an unknown email always gets the same generic reply.
    if (!user || !(await user.comparePassword(password))) {
      logger.warn("auth.login_failed", { email: email.toLowerCase(), reason: "invalid_credentials" });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.status !== "active") {
      logger.warn("auth.login_failed", { userId: user.id, vendorId: user.vendorId, reason: "account_inactive" });
      return res.status(403).json({ message: "This account has been disabled. Contact your administrator." });
    }

    if (user.vendor && !user.vendor.isActive) {
      logger.warn("auth.login_failed", { userId: user.id, vendorId: user.vendorId, reason: "vendor_disabled" });
      return res
        .status(403)
        .json({ message: "This restaurant's account has been disabled. Contact support to reactivate it." });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    setAuthCookie(res, token);
    logger.info("auth.login_success", { userId: user.id, vendorId: user.vendorId, role: user.role.name });

    res.json({
      user: {
        id: user.id,
        vendorId: user.vendorId,
        branchId: user.branchId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role.name,
      },
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out" });
}

async function me(req, res, next) {
  try {
    const user = req.user;

    // Only /auth/me needs the vendor's plan limits (shown on the vendor's
    // own Branches/Staff pages), so this join is done here rather than in
    // the `protect` middleware, which runs on every authenticated request.
    let planLimits = null;
    let branchCount;
    let userCount;
    if (user.vendorId) {
      const [vendor, branches, users] = await Promise.all([
        Vendor.findByPk(user.vendorId, { include: [{ model: SubscriptionPlan, as: "plan" }] }),
        Branch.count({ where: { vendorId: user.vendorId } }),
        User.count({ where: { vendorId: user.vendorId } }),
      ]);
      planLimits = vendor.plan ? { maxUsers: vendor.plan.maxUsers, maxBranches: vendor.plan.maxBranches } : null;
      branchCount = branches;
      userCount = users;
    }

    res.json({
      id: user.id,
      vendorId: user.vendorId,
      branchId: user.branchId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role.name,
      vendor: user.vendor
        ? {
            id: user.vendor.id,
            name: user.vendor.name,
            slug: user.vendor.slug,
            logoUrl: user.vendor.logoUrl,
            brandColor: user.vendor.brandColor,
            defaultBillSize: user.vendor.defaultBillSize,
            planLimits,
            branchCount,
            userCount,
          }
        : null,
      branch: user.branch ? { id: user.branch.id, name: user.branch.name } : null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me };
