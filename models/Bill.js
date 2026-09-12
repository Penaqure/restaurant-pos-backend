module.exports = (sequelize, DataTypes) => {
  const Bill = sequelize.define(
    "Bill",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      branchId: { type: DataTypes.UUID, allowNull: false },
      orderId: { type: DataTypes.UUID, allowNull: false, unique: true },
      billNumber: { type: DataTypes.STRING, allowNull: false },
      subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      discountId: { type: DataTypes.UUID, allowNull: true },
      discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      // [{ ratePercent, taxableAmount, taxAmount }, ...] -- one entry per
      // distinct tax rate present on the order's line items.
      taxBreakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      taxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      roundOffAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      amountPaid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      balanceDue: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      paymentStatus: {
        type: DataTypes.ENUM("unpaid", "partial", "paid", "refunded"),
        allowNull: false,
        defaultValue: "unpaid",
      },
      status: {
        type: DataTypes.ENUM("draft", "finalized", "void"),
        allowNull: false,
        defaultValue: "finalized",
      },
      pdfUrl: { type: DataTypes.STRING, allowNull: true },
      generatedBy: { type: DataTypes.UUID, allowNull: false },
      generatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "bills",
      underscored: true,
    }
  );

  Bill.associate = (models) => {
    Bill.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    Bill.belongsTo(models.Branch, { foreignKey: "branchId", as: "branch" });
    Bill.belongsTo(models.Order, { foreignKey: "orderId", as: "order" });
    Bill.belongsTo(models.Discount, { foreignKey: "discountId", as: "discount" });
    Bill.belongsTo(models.User, { foreignKey: "generatedBy", as: "generator" });
  };

  return Bill;
};
