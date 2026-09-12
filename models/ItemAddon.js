module.exports = (sequelize, DataTypes) => {
  const ItemAddon = sequelize.define(
    "ItemAddon",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      menuItemId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "item_addons",
      underscored: true,
    }
  );

  ItemAddon.associate = (models) => {
    ItemAddon.belongsTo(models.MenuItem, { foreignKey: "menuItemId", as: "menuItem" });
  };

  return ItemAddon;
};
