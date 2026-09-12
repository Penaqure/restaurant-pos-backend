const { MenuItem, ItemVariant, ItemAddon, TaxRate } = require("../models");

// Thrown for any bad input in an order payload -- callers catch this
// specifically to turn it into a 400 instead of a generic 500, while any
// other error still bubbles up as a real server error.
class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Shared by the staff order endpoint and the public QR-ordering endpoint so
// the two can never compute a bill differently. Prices are always
// recomputed from the DB here -- client-submitted prices are never trusted,
// and unavailable items are rejected outright.
async function computeOrderLines({ vendorId, items, vendor }, transaction) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderValidationError("At least one item is required");
  }

  const lineData = [];
  for (const line of items) {
    if (!line.menuItemId || !line.quantity || line.quantity < 1) {
      throw new OrderValidationError("Each item needs menuItemId and a positive quantity");
    }

    const menuItem = await MenuItem.findOne({
      where: { id: line.menuItemId, vendorId },
      include: [{ model: TaxRate, as: "taxRate" }],
      transaction,
    });
    if (!menuItem || !menuItem.isAvailable) {
      throw new OrderValidationError(`Menu item ${line.menuItemId} is not available`);
    }

    let unitPrice = Number(menuItem.basePrice);
    let variantName = null;
    let variantId = null;
    if (line.variantId) {
      const variant = await ItemVariant.findOne({
        where: { id: line.variantId, menuItemId: menuItem.id },
        transaction,
      });
      if (!variant) {
        throw new OrderValidationError(`Invalid variant for item ${menuItem.name}`);
      }
      unitPrice = Number(variant.price);
      variantName = variant.name;
      variantId = variant.id;
    }

    const addonRows = [];
    let addonsAmount = 0;
    for (const a of line.addons || []) {
      const addon = await ItemAddon.findOne({
        where: { id: a.addonId, menuItemId: menuItem.id, isActive: true },
        transaction,
      });
      if (!addon) {
        throw new OrderValidationError(`Invalid addon for item ${menuItem.name}`);
      }
      const qty = a.quantity && a.quantity > 0 ? a.quantity : 1;
      addonsAmount += Number(addon.price) * qty;
      addonRows.push({ addonId: addon.id, nameSnapshot: addon.name, priceSnapshot: addon.price, quantity: qty });
    }

    const taxRatePercent = Number(menuItem.taxRate?.ratePercent ?? vendor.defaultTaxRatePercent ?? 0);
    const lineTotal = unitPrice * line.quantity + addonsAmount;

    lineData.push({
      menuItemId: menuItem.id,
      variantId,
      itemNameSnapshot: menuItem.name,
      variantNameSnapshot: variantName,
      unitPriceSnapshot: unitPrice,
      taxRatePercentSnapshot: taxRatePercent,
      quantity: line.quantity,
      lineTotal,
      notes: line.notes || null,
      addonRows,
    });
  }

  const subtotal = lineData.reduce((sum, l) => sum + l.lineTotal, 0);
  const taxAmount = lineData.reduce((sum, l) => sum + (l.lineTotal * l.taxRatePercentSnapshot) / 100, 0);
  const totalAmount = subtotal + taxAmount;

  return { lineData, subtotal, taxAmount, totalAmount };
}

module.exports = { computeOrderLines, OrderValidationError };
