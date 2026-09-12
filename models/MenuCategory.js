module.exports = (sequelize, DataTypes) => {
  const MenuCategory = sequelize.define(
    "MenuCategory",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "menu_categories",
      underscored: true,
    }
  );

  MenuCategory.associate = (models) => {
    MenuCategory.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    MenuCategory.hasMany(models.MenuItem, { foreignKey: "categoryId", as: "items" });
  };

  return MenuCategory;
};
