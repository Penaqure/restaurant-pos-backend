const path = require("path");
const bcrypt = require("bcryptjs");
const { sequelize, Vendor, Branch, Role, User, SubscriptionPlan, Order } = require("../../models");
const { VENDOR_ROLE_DEFAULTS, ROLES } = require("../../config/constants");
const { slugify } = require("../../utils/slugify");

// Onboards a new vendor: creates the vendor, its first branch, its default
// role set, and the owner account, all inside one transaction so a failure
// partway through never leaves an orphaned vendor with no way to log in.
async function createVendor(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const {
      vendorName,
      contactEmail,
      contactPhone,
      gstin,
      branchName,
      currency,
      country,
      timezone,
      invoicePrefix,
      defaultTaxRatePercent,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPassword,
    } = req.body;

    if (!vendorName || !contactEmail || !ownerEmail || !ownerPassword) {
      await t.rollback();
      return res.status(400).json({
        message: "vendorName, contactEmail, ownerEmail and ownerPassword are required",
      });
    }

    const vendor = await Vendor.create(
      {
        name: vendorName,
        slug: `${slugify(vendorName)}-${Date.now().toString(36)}`,
        contactEmail,
        contactPhone,
        gstin,
        ...(currency && { currency }),
        ...(country && { country }),
        ...(timezone && { timezone }),
        ...(invoicePrefix && { invoicePrefix }),
        ...(defaultTaxRatePercent !== undefined && { defaultTaxRatePercent }),
      },
      { transaction: t }
    );

    const branch = await Branch.create(
      { vendorId: vendor.id, name: branchName || "Main Branch" },
      { transaction: t }
    );

    const roles = await Role.bulkCreate(
      VENDOR_ROLE_DEFAULTS.map((r) => ({ vendorId: vendor.id, name: r.name, permissions: r.permissions })),
      { transaction: t, returning: true }
    );
    const ownerRole = roles.find((r) => r.name === ROLES.OWNER);

    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    const owner = await User.create(
      {
        vendorId: vendor.id,
        branchId: null,
        roleId: ownerRole.id,
        firstName: ownerFirstName || "Owner",
        lastName: ownerLastName || "",
        email: ownerEmail.toLowerCase(),
        passwordHash,
      },
      { transaction: t }
    );

    await t.commit();

    res.status(201).json({
      vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug },
      branch: { id: branch.id, name: branch.name },
      owner: { id: owner.id, email: owner.email },
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function listVendors(req, res, next) {
  try {
    const vendors = await Vendor.findAll({
      include: [
        { model: Branch, as: "branches" },
        { model: SubscriptionPlan, as: "plan" },
      ],
    });
    res.json(vendors);
  } catch (err) {
    next(err);
  }
}

async function getVendor(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.params.id, {
      include: [
        { model: Branch, as: "branches" },
        { model: SubscriptionPlan, as: "plan" },
      ],
    });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const userCount = await User.count({ where: { vendorId: vendor.id } });
    res.json({ ...vendor.toJSON(), userCount });
  } catch (err) {
    next(err);
  }
}

async function updateVendor(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.params.id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const {
      name,
      contactEmail,
      contactPhone,
      gstin,
      planId,
      planStatus,
      brandColor,
      isActive,
      currency,
      country,
      timezone,
      invoicePrefix,
      defaultTaxRatePercent,
    } = req.body;

    if (planId) {
      const plan = await SubscriptionPlan.findByPk(planId);
      if (!plan) return res.status(400).json({ message: "Invalid plan" });
    }
    if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
      return res.status(400).json({ message: "brandColor must be a hex color like #5a3ff0" });
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ message: "currency must be a 3-letter code like INR" });
    }
    if (country && !/^[A-Z]{2,5}$/.test(country)) {
      return res.status(400).json({ message: "country must be a 2-5 letter code like IN" });
    }

    await vendor.update({
      ...(name !== undefined && { name }),
      ...(contactEmail !== undefined && { contactEmail }),
      ...(contactPhone !== undefined && { contactPhone }),
      ...(gstin !== undefined && { gstin }),
      ...(planId !== undefined && { planId: planId || null }),
      ...(planStatus !== undefined && { planStatus }),
      ...(brandColor !== undefined && { brandColor }),
      ...(isActive !== undefined && { isActive }),
      ...(currency !== undefined && { currency }),
      ...(country !== undefined && { country }),
      ...(timezone !== undefined && { timezone }),
      ...(invoicePrefix !== undefined && { invoicePrefix }),
      ...(defaultTaxRatePercent !== undefined && { defaultTaxRatePercent }),
    });

    const updated = await Vendor.findByPk(vendor.id, {
      include: [
        { model: Branch, as: "branches" },
        { model: SubscriptionPlan, as: "plan" },
      ],
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// Every vendor_id foreign key in the schema cascades, so deleting a vendor
// row wipes its branches, staff, menu, and (if allowed) its entire order
// and billing history in one shot. That's fine for a vendor that was just
// onboarded and never took an order, but never acceptable once real orders
// exist -- financial records don't get casually deleted. Those vendors must
// be disabled (isActive: false) instead, which blocks all logins but keeps
// the records intact.
async function deleteVendor(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.params.id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const orderCount = await Order.count({ where: { vendorId: vendor.id } });
    if (orderCount > 0) {
      return res.status(409).json({
        message: `This vendor has ${orderCount} order(s) on record and can't be deleted. Disable it instead to block access while keeping the history.`,
      });
    }

    await vendor.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function uploadVendorLogo(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.params.id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    if (!req.file) return res.status(400).json({ message: "image file is required" });

    const logoUrl = `/uploads/${path.basename(req.file.path)}`;
    await vendor.update({ logoUrl });
    res.json({ logoUrl });
  } catch (err) {
    next(err);
  }
}

module.exports = { createVendor, listVendors, getVendor, updateVendor, deleteVendor, uploadVendorLogo };
