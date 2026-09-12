const { sequelize, Payment, Bill, User } = require("../../models");
const { PAYMENT_METHODS } = require("../../config/constants");
const { round2 } = require("../../services/billingService");

const paymentIncludes = [{ model: User, as: "recorder", attributes: ["id", "firstName", "lastName"] }];

// Recomputes amountPaid/balanceDue/paymentStatus for a bill from its
// recorded (non-void) payments. Caller must hold the bill row lock.
async function recalculateBill(bill, transaction) {
  const total = await Payment.sum("amount", {
    where: { billId: bill.id, status: "recorded" },
    transaction,
  });
  const amountPaid = round2(total || 0);
  const balanceDue = round2(Number(bill.totalAmount) - amountPaid);
  const paymentStatus = amountPaid <= 0 ? "unpaid" : balanceDue <= 0 ? "paid" : "partial";
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
      return res.status(400).json({
        message: `Amount exceeds the remaining balance of ₹${bill.balanceDue}`,
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
        recordedBy: req.user.id,
        paidAt: new Date(),
      },
      { transaction: t }
    );

    await recalculateBill(bill, t);
    await t.commit();

    const created = await Payment.findByPk(payment.id, { include: paymentIncludes });
    res.status(201).json({ payment: created, bill: await bill.reload() });
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
    await t.commit();

    res.json({ payment: await payment.reload(), bill: await bill.reload() });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = { listPayments, recordPayment, voidPayment };
