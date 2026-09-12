module.exports = (sequelize, DataTypes) => {
  const Discount = sequelize.define(
    "Discount",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.ENUM("percentage", "flat"), allowNull: false },
      value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      minOrderAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      validFrom: { type: DataTypes.DATE, allowNull: true },
      validTo: { type: DataTypes.DATE, allowNull: true },
      usageLimit: { type: DataTypes.INTEGER, allowNull: true },
      usageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "discounts",
      underscored: true,
      indexes: [{ unique: true, fields: ["vendor_id", "code"] }],
    }
  );

  Discount.associate = (models) => {
    Discount.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    Discount.hasMany(models.Bill, { foreignKey: "discountId", as: "bills" });
  };

  return Discount;
};
