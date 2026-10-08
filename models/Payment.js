module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define(
    "Payment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      billId: { type: DataTypes.UUID, allowNull: false },
      method: {
        type: DataTypes.ENUM("cash", "card", "upi", "wallet", "other"),
        allowNull: false,
      },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      referenceNumber: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.ENUM("recorded", "void"), allowNull: false, defaultValue: "recorded" },
      // "refund" rows are their own entries (see refundPayment in
      // paymentController.js) rather than mutations of the original payment
      // -- keeps the original row an untouched record of what was actually
      // collected, with the refund as a separate, auditable transaction.
      type: { type: DataTypes.ENUM("payment", "refund"), allowNull: false, defaultValue: "payment" },
      relatedPaymentId: { type: DataTypes.UUID, allowNull: true },
      recordedBy: { type: DataTypes.UUID, allowNull: false },
      paidAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      notes: { type: DataTypes.STRING, allowNull: true },
      // Reserved for a future live payment gateway integration -- unused in
      // this manual-recording MVP, kept so the schema needs no rework later.
      gatewayName: { type: DataTypes.STRING, allowNull: true },
      gatewayTransactionId: { type: DataTypes.STRING, allowNull: true },
      gatewayPayload: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: "payments",
      underscored: true,
    }
  );

  Payment.associate = (models) => {
    Payment.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    Payment.belongsTo(models.Bill, { foreignKey: "billId", as: "bill" });
    Payment.belongsTo(models.User, { foreignKey: "recordedBy", as: "recorder" });
    Payment.belongsTo(models.Payment, { foreignKey: "relatedPaymentId", as: "relatedPayment" });
    Payment.hasMany(models.Payment, { foreignKey: "relatedPaymentId", as: "refunds" });
  };

  return Payment;
};
