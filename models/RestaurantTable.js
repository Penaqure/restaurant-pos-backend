module.exports = (sequelize, DataTypes) => {
  const RestaurantTable = sequelize.define(
    "RestaurantTable",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      branchId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      // Freeform seating area tag, e.g. "AC - 1st Floor", "Non-AC", "Terrace".
      location: { type: DataTypes.STRING, allowNull: true },
      capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
      status: {
        type: DataTypes.ENUM("available", "occupied", "reserved", "cleaning"),
        allowNull: false,
        defaultValue: "available",
      },
    },
    {
      tableName: "restaurant_tables",
      underscored: true,
    }
  );

  RestaurantTable.associate = (models) => {
    RestaurantTable.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    RestaurantTable.belongsTo(models.Branch, { foreignKey: "branchId", as: "branch" });
    RestaurantTable.hasMany(models.Order, { foreignKey: "tableId", as: "orders" });
  };

  return RestaurantTable;
};
