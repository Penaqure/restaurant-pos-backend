module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define(
    "Order",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      branchId: { type: DataTypes.UUID, allowNull: false },
      tableId: { type: DataTypes.UUID, allowNull: true },
      orderNumber: { type: DataTypes.STRING, allowNull: false },
      orderType: {
        type: DataTypes.ENUM("dine_in", "takeaway", "delivery"),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("placed", "preparing", "ready", "served", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "placed",
      },
      customerName: { type: DataTypes.STRING, allowNull: true },
      customerPhone: { type: DataTypes.STRING, allowNull: true },
      deliveryAddress: { type: DataTypes.STRING, allowNull: true },
      notes: { type: DataTypes.STRING, allowNull: true },
      subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      taxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      servedBy: { type: DataTypes.UUID, allowNull: true },
      source: {
        type: DataTypes.ENUM("staff", "customer_qr"),
        allowNull: false,
        defaultValue: "staff",
      },
      placedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      completedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "orders",
      underscored: true,
      indexes: [{ unique: true, fields: ["vendor_id", "branch_id", "order_number"] }],
    }
  );

  Order.associate = (models) => {
    Order.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    Order.belongsTo(models.Branch, { foreignKey: "branchId", as: "branch" });
    Order.belongsTo(models.RestaurantTable, { foreignKey: "tableId", as: "table" });
    Order.belongsTo(models.User, { foreignKey: "createdBy", as: "creator" });
    Order.belongsTo(models.User, { foreignKey: "servedBy", as: "server" });
    Order.hasMany(models.OrderItem, { foreignKey: "orderId", as: "items" });
  };

  return Order;
};
