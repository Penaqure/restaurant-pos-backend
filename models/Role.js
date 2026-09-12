module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define(
    "Role",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // NULL vendorId identifies the platform-level super_admin role.
      vendorId: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    },
    {
      tableName: "roles",
      underscored: true,
      indexes: [{ unique: true, fields: ["vendor_id", "name"] }],
    }
  );

  Role.associate = (models) => {
    Role.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    Role.hasMany(models.User, { foreignKey: "roleId", as: "users" });
  };

  return Role;
};
