module.exports = (sequelize, DataTypes) => {
  const Counter = sequelize.define(
    "Counter",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      branchId: { type: DataTypes.UUID, allowNull: true },
      counterType: { type: DataTypes.ENUM("order", "bill"), allowNull: false },
      currentNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: "counters",
      underscored: true,
      indexes: [{ unique: true, fields: ["vendor_id", "branch_id", "counter_type"] }],
    }
  );

  return Counter;
};
