const path = require("path");
const { Vendor } = require("../../models");
const { SIZE_PRESETS } = require("../../templates/billTemplate");
const logger = require("../../utils/logger");

const SETTINGS_FIELDS = ["defaultBillSize", "billShowGst", "billShowLogo", "billFooterNote"];

function serialize(vendor) {
  return {
    defaultBillSize: vendor.defaultBillSize,
    billShowGst: vendor.billShowGst,
    billShowLogo: vendor.billShowLogo,
    billFooterNote: vendor.billFooterNote,
  };
}

async function getBillingSettings(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.vendorId);
    res.json(serialize(vendor));
  } catch (err) {
    next(err);
  }
}

async function updateBillingSettings(req, res, next) {
  try {
    const updates = {};

    if ("defaultBillSize" in req.body) {
      if (!SIZE_PRESETS[req.body.defaultBillSize]) {
        return res.status(400).json({ message: "Invalid bill size" });
      }
      updates.defaultBillSize = req.body.defaultBillSize;
    }
    if ("billShowGst" in req.body) updates.billShowGst = !!req.body.billShowGst;
    if ("billShowLogo" in req.body) updates.billShowLogo = !!req.body.billShowLogo;
    if ("billFooterNote" in req.body) {
      const note = typeof req.body.billFooterNote === "string" ? req.body.billFooterNote.trim() : "";
      updates.billFooterNote = note.slice(0, 280) || null;
    }

    const vendor = await Vendor.findByPk(req.vendorId);
    await vendor.update(updates);
    logger.info("vendor_settings.updated", { vendorId: req.vendorId, userId: req.user.id, changedFields: Object.keys(updates) });
    res.json(serialize(vendor));
  } catch (err) {
    next(err);
  }
}

// -- Branding (name, logo, brand color) --

function serializeBranding(vendor) {
  return {
    name: vendor.name,
    brandColor: vendor.brandColor,
    logoUrl: vendor.logoUrl,
  };
}

async function getBrandingSettings(req, res, next) {
  try {
    const vendor = await Vendor.findByPk(req.vendorId);
    res.json(serializeBranding(vendor));
  } catch (err) {
    next(err);
  }
}

async function updateBrandingSettings(req, res, next) {
  try {
    const updates = {};

    if ("name" in req.body) {
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(400).json({ message: "name is required" });
      updates.name = name;
    }
    if ("brandColor" in req.body) {
      if (!/^#[0-9a-fA-F]{6}$/.test(req.body.brandColor)) {
        return res.status(400).json({ message: "brandColor must be a hex color like #c81e1e" });
      }
      updates.brandColor = req.body.brandColor;
    }

    const vendor = await Vendor.findByPk(req.vendorId);
    await vendor.update(updates);
    logger.info("vendor_settings.branding_updated", { vendorId: req.vendorId, userId: req.user.id, changedFields: Object.keys(updates) });
    res.json(serializeBranding(vendor));
  } catch (err) {
    next(err);
  }
}

async function uploadLogo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "logo file is required" });

    const vendor = await Vendor.findByPk(req.vendorId);
    const logoUrl = `/uploads/${path.basename(req.file.path)}`;
    await vendor.update({ logoUrl });
    logger.info("vendor_settings.logo_updated", { vendorId: req.vendorId, userId: req.user.id });
    res.json({ logoUrl });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBillingSettings,
  updateBillingSettings,
  SETTINGS_FIELDS,
  getBrandingSettings,
  updateBrandingSettings,
  uploadLogo,
};
