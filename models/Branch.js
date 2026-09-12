module.exports = (sequelize, DataTypes) => {
  const Branch = sequelize.define(
    "Branch",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      address: { type: DataTypes.STRING },
      city: { type: DataTypes.STRING },
      phone: { type: DataTypes.STRING },
      gstin: { type: DataTypes.STRING },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "branches",
      underscored: true,
    }
  );

  Branch.associate = (models) => {
    Branch.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    Branch.hasMany(models.User, { foreignKey: "branchId", as: "users" });
  };

  return Branch;
};
