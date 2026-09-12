const {
  sequelize,
  RestaurantTable,
  Branch,
  Vendor,
  MenuCategory,
  MenuItem,
  ItemVariant,
  ItemAddon,
  TaxRate,
  Order,
  OrderItem,
  OrderItemAddon,
} = require("../../models");
const counterService = require("../../services/counterService");
const { computeOrderLines, OrderValidationError } = require("../../services/orderPricingService");

const itemIncludes = [
  { model: ItemVariant, as: "variants" },
  { model: ItemAddon, as: "addons" },
  { model: MenuCategory, as: "category", attributes: ["id", "name"] },
  { model: TaxRate, as: "taxRate", attributes: ["id", "name", "ratePercent"] },
];

// Anyone holding a table's QR code can reach these two endpoints -- no
// login, no tenant-scope middleware. Every lookup below is keyed off the
// scanned tableId itself rather than any caller-supplied vendorId, so a
// customer can only ever see or order into the one table they scanned.
async function resolveTable(tableId, transaction) {
  const table = await RestaurantTable.findByPk(tableId, { transaction });
  if (!table) return null;

  const [branch, vendor] = await Promise.all([
    Branch.findByPk(table.branchId, { transaction }),
    Vendor.findByPk(table.vendorId, { transaction }),
  ]);
  if (!branch || !branch.isActive || !vendor || !vendor.isActive) return null;

  return { table, branch, vendor };
}

async function getPublicMenu(req, res, next) {
  try {
    const resolved = await resolveTable(req.params.tableId);
    if (!resolved) return res.status(404).json({ message: "This QR code is no longer valid" });
    const { table, branch, vendor } = resolved;

    const categories = await MenuCategory.findAll({
      where: { vendorId: vendor.id, isActive: true },
      order: [["sortOrder", "ASC"]],
    });
    const items = await MenuItem.findAll({
      where: { vendorId: vendor.id, isAvailable: true },
      include: itemIncludes,
      order: [["sortOrder", "ASC"]],
    });
    // Items in an inactive category are still isAvailable, but shouldn't
    // show up in a category-less section on the customer's menu.
    const activeCategoryIds = new Set(categories.map((c) => c.id));
    const visibleItems = items.filter((i) => activeCategoryIds.has(i.categoryId));

    res.json({
      vendor: { name: vendor.name, logoUrl: vendor.logoUrl, brandColor: vendor.brandColor },
      branch: { id: branch.id, name: branch.name },
      table: { id: table.id, name: table.name, status: table.status },
      categories,
      items: visibleItems,
    });
  } catch (err) {
    next(err);
  }
}

async function createPublicOrder(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { tableId, customerName, items } = req.body;
    if (!tableId) {
      await t.rollback();
      return res.status(400).json({ message: "tableId is required" });
    }

    const resolved = await resolveTable(tableId, t);
    if (!resolved) {
      await t.rollback();
      return res.status(404).json({ message: "This QR code is no longer valid" });
    }
    const { table, branch, vendor } = resolved;

    let lineData, subtotal, taxAmount, totalAmount;
    try {
      ({ lineData, subtotal, taxAmount, totalAmount } = await computeOrderLines(
        { vendorId: vendor.id, items, vendor },
        t
      ));
    } catch (err) {
      await t.rollback();
      if (err instanceof OrderValidationError) return res.status(err.status).json({ message: err.message });
      throw err;
    }

    const sequence = await counterService.getNextNumber(
      { vendorId: vendor.id, branchId: branch.id, counterType: "order" },
      t
    );
    const orderNumber = counterService.formatNumber("ORD", sequence);

    const order = await Order.create(
      {
        vendorId: vendor.id,
        branchId: branch.id,
        tableId: table.id,
        orderNumber,
        orderType: "dine_in",
        status: "placed",
        customerName: customerName ? String(customerName).slice(0, 100) : null,
        subtotal,
        discountAmount: 0,
        taxAmount,
        totalAmount,
        createdBy: null,
        source: "customer_qr",
        placedAt: new Date(),
      },
      { transaction: t }
    );

    for (const line of lineData) {
      const orderItem = await OrderItem.create(
        {
          orderId: order.id,
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          itemNameSnapshot: line.itemNameSnapshot,
          variantNameSnapshot: line.variantNameSnapshot,
          unitPriceSnapshot: line.unitPriceSnapshot,
          taxRatePercentSnapshot: line.taxRatePercentSnapshot,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          notes: line.notes,
        },
        { transaction: t }
      );
      if (line.addonRows.length > 0) {
        await OrderItemAddon.bulkCreate(
          line.addonRows.map((a) => ({ ...a, orderItemId: orderItem.id })),
          { transaction: t }
        );
      }
    }

    await table.update({ status: "occupied" }, { transaction: t });

    await t.commit();

    res.status(201).json({ orderNumber: order.orderNumber, totalAmount: order.totalAmount, tableName: table.name });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = { getPublicMenu, createPublicOrder };
