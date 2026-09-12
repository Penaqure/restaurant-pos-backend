module.exports = (sequelize, DataTypes) => {
  const SubscriptionPlan = sequelize.define(
    "SubscriptionPlan",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      priceMonthly: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      billingCycle: { type: DataTypes.STRING, allowNull: false, defaultValue: "monthly" },
      maxBranches: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      maxUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "subscription_plans",
      underscored: true,
    }
  );

  SubscriptionPlan.associate = (models) => {
    SubscriptionPlan.hasMany(models.Vendor, { foreignKey: "planId", as: "vendors" });
  };

  return SubscriptionPlan;
};
