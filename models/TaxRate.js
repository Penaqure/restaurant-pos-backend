module.exports = (sequelize, DataTypes) => {
  const TaxRate = sequelize.define(
    "TaxRate",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      ratePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "tax_rates",
      underscored: true,
    }
  );

  TaxRate.associate = (models) => {
    TaxRate.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    TaxRate.hasMany(models.MenuItem, { foreignKey: "taxRateId", as: "menuItems" });
  };

  return TaxRate;
};
