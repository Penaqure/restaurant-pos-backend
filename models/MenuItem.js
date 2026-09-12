module.exports = (sequelize, DataTypes) => {
  const MenuItem = sequelize.define(
    "MenuItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      categoryId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING },
      basePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      imageUrl: { type: DataTypes.STRING },
      isVeg: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // Overrides the vendor's default tax rate for this item when set.
      taxRateId: { type: DataTypes.UUID, allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: "menu_items",
      underscored: true,
    }
  );

  MenuItem.associate = (models) => {
    MenuItem.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    MenuItem.belongsTo(models.MenuCategory, { foreignKey: "categoryId", as: "category" });
    MenuItem.belongsTo(models.TaxRate, { foreignKey: "taxRateId", as: "taxRate" });
    MenuItem.hasMany(models.ItemVariant, { foreignKey: "menuItemId", as: "variants" });
    MenuItem.hasMany(models.ItemAddon, { foreignKey: "menuItemId", as: "addons" });
  };

  return MenuItem;
};
