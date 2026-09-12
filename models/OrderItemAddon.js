module.exports = (sequelize, DataTypes) => {
  const OrderItemAddon = sequelize.define(
    "OrderItemAddon",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      orderItemId: { type: DataTypes.UUID, allowNull: false },
      addonId: { type: DataTypes.UUID, allowNull: true },
      nameSnapshot: { type: DataTypes.STRING, allowNull: false },
      priceSnapshot: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    },
    {
      tableName: "order_item_addons",
      underscored: true,
    }
  );

  OrderItemAddon.associate = (models) => {
    OrderItemAddon.belongsTo(models.OrderItem, { foreignKey: "orderItemId", as: "orderItem" });
    OrderItemAddon.belongsTo(models.ItemAddon, { foreignKey: "addonId", as: "addon" });
  };

  return OrderItemAddon;
};
