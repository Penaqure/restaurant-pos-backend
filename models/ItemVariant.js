module.exports = (sequelize, DataTypes) => {
  const ItemVariant = sequelize.define(
    "ItemVariant",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      menuItemId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: "item_variants",
      underscored: true,
    }
  );

  ItemVariant.associate = (models) => {
    ItemVariant.belongsTo(models.MenuItem, { foreignKey: "menuItemId", as: "menuItem" });
  };

  return ItemVariant;
};
