const crypto = require("crypto");
const { MenuItem, ItemVariant, ItemAddon, TaxRate, OrderItem, OrderItemAddon } = require("../models");

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
  for (const line of items) {
    if (!line.menuItemId || !line.quantity || line.quantity < 1) {
      throw new OrderValidationError("Each item needs menuItemId and a positive quantity");
    }
  }

  // Batch-fetch every menu item/variant/addon referenced across all lines up
  // front instead of a query per line (and another per addon on that line)
  // -- an order of N items with addons used to cost roughly N * (2-3) DB
  // round trips run one after another; this is 3 total, regardless of N.
  const menuItemIds = [...new Set(items.map((l) => l.menuItemId))];
  const variantIds = [...new Set(items.map((l) => l.variantId).filter(Boolean))];
  const addonIds = [...new Set(items.flatMap((l) => (l.addons || []).map((a) => a.addonId)).filter(Boolean))];

  const [menuItems, variants, addons] = await Promise.all([
    MenuItem.findAll({ where: { id: menuItemIds, vendorId }, include: [{ model: TaxRate, as: "taxRate" }], transaction }),
    variantIds.length ? ItemVariant.findAll({ where: { id: variantIds }, transaction }) : [],
    addonIds.length ? ItemAddon.findAll({ where: { id: addonIds, isActive: true }, transaction }) : [],
  ]);
  const menuItemById = new Map(menuItems.map((m) => [m.id, m]));
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const addonById = new Map(addons.map((a) => [a.id, a]));

  const lineData = [];
  for (const line of items) {
    const menuItem = menuItemById.get(line.menuItemId);
    if (!menuItem || !menuItem.isAvailable) {
      throw new OrderValidationError(`Menu item ${line.menuItemId} is not available`);
    }

    let unitPrice = Number(menuItem.basePrice);
    let variantName = null;
    let variantId = null;
    if (line.variantId) {
      const variant = variantById.get(line.variantId);
      if (!variant || variant.menuItemId !== menuItem.id) {
        throw new OrderValidationError(`Invalid variant for item ${menuItem.name}`);
      }
      unitPrice = Number(variant.price);
      variantName = variant.name;
      variantId = variant.id;
    }

    const addonRows = [];
    let addonsAmount = 0;
    for (const a of line.addons || []) {
      const addon = addonById.get(a.addonId);
      if (!addon || addon.menuItemId !== menuItem.id) {
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

// Writes the lineData from computeOrderLines() as OrderItem/OrderItemAddon
// rows. IDs are generated here (rather than left to the DB default) so
// every row -- items and their addons -- can go in with two bulkCreate
// calls total instead of a create() per item plus a bulkCreate() per item's
// addons, which used to mean an order of N items cost roughly N sequential
// round trips just to insert.
async function insertOrderLines(orderId, lineData, transaction) {
  const itemRows = lineData.map((line) => ({
    id: crypto.randomUUID(),
    orderId,
    menuItemId: line.menuItemId,
    variantId: line.variantId,
    itemNameSnapshot: line.itemNameSnapshot,
    variantNameSnapshot: line.variantNameSnapshot,
    unitPriceSnapshot: line.unitPriceSnapshot,
    taxRatePercentSnapshot: line.taxRatePercentSnapshot,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
    notes: line.notes,
  }));
  await OrderItem.bulkCreate(itemRows, { transaction });

  const addonRows = lineData.flatMap((line, i) =>
    line.addonRows.map((a) => ({ ...a, orderItemId: itemRows[i].id }))
  );
  if (addonRows.length > 0) {
    await OrderItemAddon.bulkCreate(addonRows, { transaction });
  }
}

module.exports = { computeOrderLines, insertOrderLines, OrderValidationError };
