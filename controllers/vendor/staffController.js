const bcrypt = require("bcryptjs");
const { User, Role, Branch, Vendor, SubscriptionPlan } = require("../../models");
const logger = require("../../utils/logger");

const staffIncludes = [
  { model: Role, as: "role" },
  { model: Branch, as: "branch" },
];

async function listStaff(req, res, next) {
  try {
    const staff = await User.findAll({
      where: { vendorId: req.vendorId },
      include: staffIncludes,
      order: [["createdAt", "ASC"]],
    });
    res.json(staff);
  } catch (err) {
    next(err);
  }
}

async function createStaff(req, res, next) {
  try {
    const { firstName, lastName, email, phone, roleId, branchId, password } = req.body;
    if (!firstName || !email || !roleId || !password) {
      return res.status(400).json({ message: "firstName, email, roleId and password are required" });
    }

    // Role must belong to this vendor -- prevents assigning another vendor's (or the platform's) role.
    const role = await Role.findOne({ where: { id: roleId, vendorId: req.vendorId } });
    if (!role) {
      return res.status(400).json({ message: "Invalid role for this vendor" });
    }

    if (branchId) {
      const branch = await Branch.findOne({ where: { id: branchId, vendorId: req.vendorId } });
      if (!branch) {
        return res.status(400).json({ message: "Invalid branch for this vendor" });
      }
    }

    // Plans cap how many staff accounts a vendor can have; a vendor with no
    // plan assigned is unrestricted (treated as an unmetered/legacy tenant).
    const vendor = await Vendor.findByPk(req.vendorId, { include: [{ model: SubscriptionPlan, as: "plan" }] });
    if (vendor.plan) {
      const userCount = await User.count({ where: { vendorId: req.vendorId } });
      if (userCount >= vendor.plan.maxUsers) {
        return res.status(403).json({
          message: `User limit reached for the ${vendor.plan.name} plan (${vendor.plan.maxUsers} users). Upgrade your plan to add more staff.`,
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const staff = await User.create({
      vendorId: req.vendorId,
      branchId: branchId || null,
      roleId,
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      passwordHash,
    });

    logger.info("staff.created", {
      vendorId: req.vendorId,
      userId: req.user.id,
      newStaffId: staff.id,
      roleId,
      branchId: branchId || null,
    });

    const created = await User.findByPk(staff.id, { include: staffIncludes });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

// Guards the vendor from ever ending up with zero active owners -- e.g. a
// manager accidentally demoting or deactivating the only owner, which would
// leave nobody able to manage the vendor's own staff/roles.
async function assertNotLastActiveOwner(vendorId, staff, roleId, status) {
  const isOwner = staff.role.name === "owner";
  const losingOwnerRole = roleId !== undefined && roleId !== staff.roleId;
  const beingDeactivated = status === "inactive";
  if (!isOwner || (!losingOwnerRole && !beingDeactivated)) return null;

  const activeOwners = await User.count({
    where: { vendorId, roleId: staff.roleId, status: "active" },
  });
  if (activeOwners <= 1) {
    return "Can't remove or deactivate the last active owner";
  }
  return null;
}

async function updateStaff(req, res, next) {
  try {
    const staff = await User.findOne({
      where: { id: req.params.id, vendorId: req.vendorId },
      include: [{ model: Role, as: "role" }],
    });
    if (!staff) return res.status(404).json({ message: "Staff member not found" });

    const { firstName, lastName, phone, roleId, branchId, status, password } = req.body;

    if (roleId) {
      const role = await Role.findOne({ where: { id: roleId, vendorId: req.vendorId } });
      if (!role) return res.status(400).json({ message: "Invalid role for this vendor" });
    }
    if (branchId) {
      const branch = await Branch.findOne({ where: { id: branchId, vendorId: req.vendorId } });
      if (!branch) return res.status(400).json({ message: "Invalid branch for this vendor" });
    }
    if (status && !["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "status must be 'active' or 'inactive'" });
    }

    const blockedReason = await assertNotLastActiveOwner(req.vendorId, staff, roleId, status);
    if (blockedReason) return res.status(409).json({ message: blockedReason });

    const update = {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(phone !== undefined && { phone }),
      ...(roleId !== undefined && { roleId }),
      ...(branchId !== undefined && { branchId: branchId || null }),
      ...(status !== undefined && { status }),
    };
    if (password) {
      update.passwordHash = await bcrypt.hash(password, 10);
    }

    await staff.update(update);

    logger.info("staff.updated", {
      vendorId: req.vendorId,
      userId: req.user.id,
      staffId: staff.id,
      changedFields: Object.keys(update).filter((k) => k !== "passwordHash"),
      ...(password && { passwordReset: true }),
    });

    const updated = await User.findByPk(staff.id, { include: staffIncludes });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = { listStaff, createStaff, updateStaff };
