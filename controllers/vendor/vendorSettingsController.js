const { Vendor } = require("../../models");
const { SIZE_PRESETS } = require("../../templates/billTemplate");

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
    res.json(serialize(vendor));
  } catch (err) {
    next(err);
  }
}

module.exports = { getBillingSettings, updateBillingSettings, SETTINGS_FIELDS };
