const jwt = require("jsonwebtoken");
const { User, Role, Vendor, SubscriptionPlan, Branch } = require("../../models");
const logger = require("../../utils/logger");

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
    logger.info("auth.login_success", { userId: user.id, vendorId: user.vendorId, role: user.role.name });

    res.json({
      token,
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

module.exports = { login, me };
