module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define(
    "OrderItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      orderId: { type: DataTypes.UUID, allowNull: false },
      menuItemId: { type: DataTypes.UUID, allowNull: false },
      variantId: { type: DataTypes.UUID, allowNull: true },
      // Snapshot fields freeze the name/price at order time so later menu
      // edits (or deletions) never distort historical orders/bills.
      itemNameSnapshot: { type: DataTypes.STRING, allowNull: false },
      variantNameSnapshot: { type: DataTypes.STRING, allowNull: true },
      unitPriceSnapshot: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      taxRatePercentSnapshot: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      lineTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      notes: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: "order_items",
      underscored: true,
    }
  );

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, { foreignKey: "orderId", as: "order" });
    OrderItem.belongsTo(models.MenuItem, { foreignKey: "menuItemId", as: "menuItem" });
    OrderItem.belongsTo(models.ItemVariant, { foreignKey: "variantId", as: "variant" });
    OrderItem.hasMany(models.OrderItemAddon, { foreignKey: "orderItemId", as: "addons" });
  };

  return OrderItem;
};
