module.exports = (sequelize, DataTypes) => {
  const Vendor = sequelize.define(
    "Vendor",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING, allowNull: false },
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
      contactEmail: { type: DataTypes.STRING, allowNull: false },
      contactPhone: { type: DataTypes.STRING },
      gstin: { type: DataTypes.STRING },
      planId: { type: DataTypes.UUID, allowNull: true },
      planStatus: {
        type: DataTypes.ENUM("trial", "active", "suspended"),
        allowNull: false,
        defaultValue: "trial",
      },
      planRenewsAt: { type: DataTypes.DATE, allowNull: true },
      logoUrl: { type: DataTypes.STRING, allowNull: true },
      brandColor: { type: DataTypes.STRING(7), allowNull: false, defaultValue: "#5a3ff0" },
      defaultTaxRatePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      invoicePrefix: { type: DataTypes.STRING, allowNull: false, defaultValue: "INV" },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "INR" },
      // Drives country-specific tax presentation on bills, e.g. India's
      // CGST/SGST split -- not just a currency/locale display concern.
      country: { type: DataTypes.STRING(5), allowNull: false, defaultValue: "IN" },
      timezone: { type: DataTypes.STRING, allowNull: false, defaultValue: "Asia/Kolkata" },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      defaultBillSize: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "a4" },
      billShowGst: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      billShowLogo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      billFooterNote: { type: DataTypes.STRING(280), allowNull: true },
    },
    {
      tableName: "vendors",
      underscored: true,
    }
  );

  Vendor.associate = (models) => {
    Vendor.belongsTo(models.SubscriptionPlan, { foreignKey: "planId", as: "plan" });
    Vendor.hasMany(models.Branch, { foreignKey: "vendorId", as: "branches" });
    Vendor.hasMany(models.Role, { foreignKey: "vendorId", as: "roles" });
    Vendor.hasMany(models.User, { foreignKey: "vendorId", as: "users" });
  };

  return Vendor;
};
