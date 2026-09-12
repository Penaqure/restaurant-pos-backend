const fs = require("fs");
const path = require("path");
const {
  sequelize,
  Bill,
  Order,
  OrderItem,
  OrderItemAddon,
  Discount,
  Vendor,
  Branch,
  RestaurantTable,
  User,
} = require("../../models");
const counterService = require("../../services/counterService");
const billingService = require("../../services/billingService");
const pdfService = require("../../services/pdfService");
const { billHtml, SIZE_PRESETS } = require("../../templates/billTemplate");

const billIncludes = [
  {
    model: Order,
    as: "order",
    include: [
      { model: RestaurantTable, as: "table", attributes: ["id", "name"] },
      { model: OrderItem, as: "items", include: [{ model: OrderItemAddon, as: "addons" }] },
    ],
  },
  { model: Discount, as: "discount", attributes: ["id", "code", "type", "value"] },
  { model: User, as: "generator", attributes: ["id", "firstName", "lastName"] },
];

function uploadsDir() {
  return path.join(__dirname, "..", "..", process.env.UPLOAD_DIR || "public/uploads", "bills");
}

const MM_TO_PX = 96 / 25.4; // CSS px are defined at 96dpi; puppeteer's viewport is in px.
const PDF_RENDER_OPTIONS = {
  a4: { format: "A4" },
  a5: { format: "A5" },
  letter: { format: "Letter" },
  "thermal-80": { width: "80mm", pixelWidth: Math.round(80 * MM_TO_PX) },
  "thermal-72": { width: "72mm", pixelWidth: Math.round(72 * MM_TO_PX) },
  "thermal-58": { width: "58mm", pixelWidth: Math.round(58 * MM_TO_PX) },
};

const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// Puppeteer renders from an in-memory HTML string (page.setContent), not a
// URL, so a relative /uploads/... path won't resolve -- the logo has to be
// inlined as a data URI read straight off disk.
function logoDataUri(logoUrl) {
  if (!logoUrl) return null;
  try {
    const filePath = path.join(__dirname, "..", "..", process.env.UPLOAD_DIR || "public/uploads", path.basename(logoUrl));
    const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
    if (!mime || !fs.existsSync(filePath)) return null;
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch {
    return null;
  }
}

async function listBills(req, res, next) {
  try {
    const where = { vendorId: req.vendorId, ...(req.branchId && { branchId: req.branchId }) };
    const bills = await Bill.findAll({ where, include: billIncludes, order: [["generatedAt", "DESC"]], limit: 100 });
    res.json(bills);
  } catch (err) {
    next(err);
  }
}

async function getBill(req, res, next) {
  try {
    const bill = await Bill.findOne({ where: { id: req.params.id, vendorId: req.vendorId }, include: billIncludes });
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    res.json(bill);
  } catch (err) {
    next(err);
  }
}

async function generateBillFromOrder(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findOne({
      where: { id: req.params.orderId, vendorId: req.vendorId },
      include: [{ model: OrderItem, as: "items" }],
      transaction: t,
    });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "completed") {
      await t.rollback();
      return res.status(409).json({ message: "Only completed orders can be billed" });
    }

    const existing = await Bill.findOne({ where: { orderId: order.id }, transaction: t });
    if (existing) {
      await t.rollback();
      return res.status(409).json({ message: "A bill already exists for this order", billId: existing.id });
    }

    let discount = null;
    if (req.body?.discountCode) {
      discount = await Discount.findOne({
        where: { vendorId: req.vendorId, code: req.body.discountCode.toUpperCase() },
        transaction: t,
      });
      if (!discount) {
        await t.rollback();
        return res.status(400).json({ message: "Invalid discount code" });
      }
    }

    const computed = billingService.computeBill(order, discount);

    const sequence = await counterService.getNextNumber(
      { vendorId: req.vendorId, branchId: order.branchId, counterType: "bill" },
      t
    );
    const vendor = await Vendor.findByPk(req.vendorId, { transaction: t });
    const billNumber = counterService.formatNumber(vendor.invoicePrefix || "INV", sequence);

    const bill = await Bill.create(
      {
        vendorId: req.vendorId,
        branchId: order.branchId,
        orderId: order.id,
        billNumber,
        subtotal: computed.subtotal,
        discountId: discount ? discount.id : null,
        discountAmount: computed.discountAmount,
        taxBreakdown: computed.taxBreakdown,
        taxAmount: computed.taxAmount,
        roundOffAmount: computed.roundOffAmount,
        totalAmount: computed.totalAmount,
        amountPaid: 0,
        balanceDue: computed.totalAmount,
        paymentStatus: "unpaid",
        status: "finalized",
        generatedBy: req.user.id,
        generatedAt: new Date(),
      },
      { transaction: t }
    );

    if (discount) {
      await discount.increment("usageCount", { transaction: t });
    }

    await t.commit();

    const created = await Bill.findByPk(bill.id, { include: billIncludes });
    res.status(201).json(created);
  } catch (err) {
    await t.rollback();
    if (err.status === 400) return res.status(400).json({ message: err.message });
    next(err);
  }
}

async function getBillPdf(req, res, next) {
  try {
    const bill = await Bill.findOne({ where: { id: req.params.id, vendorId: req.vendorId }, include: billIncludes });
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    const vendor = await Vendor.findByPk(req.vendorId);
    const size = SIZE_PRESETS[req.query.size] ? req.query.size : vendor.defaultBillSize;

    // Each size renders its own file -- a receipt-sized PDF and an A4 one
    // for the same bill are genuinely different documents, not a cache of
    // the same thing. The vendor's updatedAt is folded into the filename so
    // toggling GST/logo/footer settings (or re-uploading a logo) busts the
    // cache instead of silently serving a stale render.
    const vendorStamp = new Date(vendor.updatedAt).getTime().toString(36);
    const filePath = path.join(uploadsDir(), `${bill.id}-${size}-${vendorStamp}.pdf`);

    if (!fs.existsSync(filePath)) {
      const branch = await Branch.findByPk(bill.branchId);
      const html = billHtml({
        bill,
        order: bill.order,
        vendor,
        branch,
        size,
        logoDataUri: logoDataUri(vendor.logoUrl),
        showGst: vendor.billShowGst,
        showLogo: vendor.billShowLogo,
        footerNote: vendor.billFooterNote,
      });
      const pdfBuffer = await pdfService.renderHtmlToPdf(html, PDF_RENDER_OPTIONS[size]);

      fs.mkdirSync(uploadsDir(), { recursive: true });
      fs.writeFileSync(filePath, pdfBuffer);

      if (bill.pdfUrl !== `/uploads/bills/${bill.id}-${size}-${vendorStamp}.pdf`) {
        await bill.update({ pdfUrl: `/uploads/bills/${bill.id}-${size}-${vendorStamp}.pdf` });
      }
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${bill.billNumber}-${size}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { listBills, getBill, generateBillFromOrder, getBillPdf };
