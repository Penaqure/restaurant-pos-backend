const { sequelize, Payment, Bill, Vendor, User } = require("../../models");
const { PAYMENT_METHODS, ROLES } = require("../../config/constants");
const { round2 } = require("../../services/billingService");
const { getCurrencySymbol } = require("../../utils/currency");
const auditService = require("../../services/auditService");
const logger = require("../../utils/logger");
const notificationService = require("../../services/notificationService");

// Mirrors billRoutes.js's canBill gate -- waiters/kitchen can't open a bill,
// so they shouldn't be notified about one being paid either.
const BILL_ACCESS_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER];

const paymentIncludes = [{ model: User, as: "recorder", attributes: ["id", "firstName", "lastName"] }];

// Recomputes amountPaid/balanceDue/paymentStatus for a bill from its
// recorded (non-void) payments and refunds. Caller must hold the bill row lock.
async function recalculateBill(bill, transaction) {
  const [paid, refunded] = await Promise.all([
    Payment.sum("amount", { where: { billId: bill.id, status: "recorded", type: "payment" }, transaction }),
    Payment.sum("amount", { where: { billId: bill.id, status: "recorded", type: "refund" }, transaction }),
  ]);
  const amountPaid = round2((paid || 0) - (refunded || 0));
  const balanceDue = round2(Number(bill.totalAmount) - amountPaid);
  // "refunded" (as opposed to plain "unpaid") specifically means money was
  // collected and has since been fully handed back -- distinct from a bill
  // that was simply never paid. balanceDue > 0 here is expected (the bill's
  // total doesn't shrink just because a refund was given) and still counts
  // as "refunded" rather than "partial", since nothing currently paid remains.
  const paymentStatus =
    amountPaid <= 0 && Number(refunded || 0) > 0
      ? "refunded"
      : amountPaid <= 0
        ? "unpaid"
        : balanceDue <= 0
          ? "paid"
          : "partial";
  await bill.update({ amountPaid, balanceDue, paymentStatus }, { transaction });
}

async function listPayments(req, res, next) {
  try {
    const where = { vendorId: req.vendorId };
    if (req.query.billId) where.billId = req.query.billId;
    const payments = await Payment.findAll({ where, include: paymentIncludes, order: [["paidAt", "DESC"]] });
    res.json(payments);
  } catch (err) {
    next(err);
  }
}

async function recordPayment(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { billId, method, amount, referenceNumber, notes } = req.body;

    if (!billId || !PAYMENT_METHODS.includes(method) || !(Number(amount) > 0)) {
      await t.rollback();
      return res.status(400).json({ message: "billId, a valid method, and a positive amount are required" });
    }

    const bill = await Bill.findOne({
      where: { id: billId, vendorId: req.vendorId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!bill) {
      await t.rollback();
      return res.status(404).json({ message: "Bill not found" });
    }
    if (bill.status === "void") {
      await t.rollback();
      return res.status(409).json({ message: "This bill has been voided" });
    }

    const amountRounded = round2(Number(amount));
    if (amountRounded > Number(bill.balanceDue)) {
      await t.rollback();
      const vendor = await Vendor.findByPk(req.vendorId, { attributes: ["currency"] });
      return res.status(400).json({
        message: `Amount exceeds the remaining balance of ${getCurrencySymbol(vendor?.currency)}${bill.balanceDue}`,
      });
    }

    const payment = await Payment.create(
      {
        vendorId: req.vendorId,
        billId: bill.id,
        method,
        amount: amountRounded,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        status: "recorded",
        type: "payment",
        recordedBy: req.user.id,
        paidAt: new Date(),
      },
      { transaction: t }
    );

    await recalculateBill(bill, t);
    await auditService.record(
      {
        vendorId: req.vendorId,
        userId: req.user.id,
        action: "payment.recorded",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { billId: bill.id, method, amount: amountRounded },
      },
      t
    );
    await t.commit();

    logger.info("payment.recorded", {
      vendorId: req.vendorId,
      userId: req.user.id,
      paymentId: payment.id,
      billId: bill.id,
      method,
      amount: amountRounded,
    });

    const created = await Payment.findByPk(payment.id, { include: paymentIncludes });
    const reloadedBill = await bill.reload();

    notificationService.emitToRoles(req.vendorId, BILL_ACCESS_ROLES, "payment:received", {
      billId: reloadedBill.id,
      billNumber: reloadedBill.billNumber,
      amount: amountRounded,
      method,
      paymentStatus: reloadedBill.paymentStatus,
      actorUserId: req.user.id,
    });

    res.status(201).json({ payment: created, bill: reloadedBill });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function voidPayment(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const payment = await Payment.findOne({ where: { id: req.params.id, vendorId: req.vendorId }, transaction: t });
    if (!payment) {
      await t.rollback();
      return res.status(404).json({ message: "Payment not found" });
    }
    if (payment.status === "void") {
      await t.rollback();
      return res.status(409).json({ message: "Payment is already void" });
    }

    const bill = await Bill.findOne({ where: { id: payment.billId }, transaction: t, lock: t.LOCK.UPDATE });

    await payment.update({ status: "void" }, { transaction: t });
    await recalculateBill(bill, t);
    await auditService.record(
      {
        vendorId: req.vendorId,
        userId: req.user.id,
        action: "payment.voided",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { billId: payment.billId, amount: payment.amount },
      },
      t
    );
    await t.commit();

    logger.info("payment.voided", {
      vendorId: req.vendorId,
      userId: req.user.id,
      paymentId: payment.id,
      billId: payment.billId,
      amount: payment.amount,
    });

    res.json({ payment: await payment.reload(), bill: await bill.reload() });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// A refund is its own new row (type: "refund", linked via relatedPaymentId)
// rather than a mutation of the original payment -- see the Payment model
// comment. Unlike voidPayment ("this entry was a mistake, no money moved"),
// this records that money genuinely went back out, amount-capped per
// original payment so it can't be refunded more than once over.
async function refundPayment(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const original = await Payment.findOne({
      where: { id: req.params.id, vendorId: req.vendorId, type: "payment" },
      transaction: t,
    });
    if (!original) {
      await t.rollback();
      return res.status(404).json({ message: "Payment not found" });
    }
    if (original.status !== "recorded") {
      await t.rollback();
      return res.status(409).json({ message: "Only a recorded payment can be refunded" });
    }

    const alreadyRefunded = await Payment.sum("amount", {
      where: { relatedPaymentId: original.id, status: "recorded", type: "refund" },
      transaction: t,
    });
    const refundable = round2(Number(original.amount) - (alreadyRefunded || 0));
    if (refundable <= 0) {
      await t.rollback();
      return res.status(409).json({ message: "This payment has already been fully refunded" });
    }

    const { amount, notes } = req.body;
    const amountRounded = amount === undefined ? refundable : round2(Number(amount));
    if (!(amountRounded > 0) || amountRounded > refundable) {
      await t.rollback();
      const vendor = await Vendor.findByPk(req.vendorId, { attributes: ["currency"] });
      return res.status(400).json({
        message: `Refund amount must be between 0 and ${getCurrencySymbol(vendor?.currency)}${refundable}`,
      });
    }

    const bill = await Bill.findOne({ where: { id: original.billId }, transaction: t, lock: t.LOCK.UPDATE });

    const refund = await Payment.create(
      {
        vendorId: req.vendorId,
        billId: original.billId,
        method: original.method,
        amount: amountRounded,
        notes: notes || null,
        status: "recorded",
        type: "refund",
        relatedPaymentId: original.id,
        recordedBy: req.user.id,
        paidAt: new Date(),
      },
      { transaction: t }
    );

    await recalculateBill(bill, t);
    await auditService.record(
      {
        vendorId: req.vendorId,
        userId: req.user.id,
        action: "payment.refunded",
        entityType: "Payment",
        entityId: refund.id,
        metadata: { originalPaymentId: original.id, billId: original.billId, amount: amountRounded },
      },
      t
    );
    await t.commit();

    logger.info("payment.refunded", {
      vendorId: req.vendorId,
      userId: req.user.id,
      refundId: refund.id,
      originalPaymentId: original.id,
      billId: original.billId,
      amount: amountRounded,
    });

    const created = await Payment.findByPk(refund.id, { include: paymentIncludes });
    const reloadedBill = await bill.reload();

    notificationService.emitToRoles(req.vendorId, BILL_ACCESS_ROLES, "payment:received", {
      billId: reloadedBill.id,
      billNumber: reloadedBill.billNumber,
      amount: amountRounded,
      method: original.method,
      paymentStatus: reloadedBill.paymentStatus,
      actorUserId: req.user.id,
    });

    res.status(201).json({ payment: created, bill: reloadedBill });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = { listPayments, recordPayment, voidPayment, refundPayment };
