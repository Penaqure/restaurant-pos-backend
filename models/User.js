const bcrypt = require("bcryptjs");

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // NULL vendorId identifies a platform super_admin.
      vendorId: { type: DataTypes.UUID, allowNull: true },
      // NULL branchId means all-branch access (owner/manager); staff are pinned to one branch.
      branchId: { type: DataTypes.UUID, allowNull: true },
      roleId: { type: DataTypes.UUID, allowNull: false },
      firstName: { type: DataTypes.STRING, allowNull: false },
      lastName: { type: DataTypes.STRING },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      phone: { type: DataTypes.STRING },
      passwordHash: { type: DataTypes.STRING, allowNull: false },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        allowNull: false,
        defaultValue: "active",
      },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "users",
      underscored: true,
      defaultScope: {
        attributes: { exclude: ["passwordHash"] },
      },
      scopes: {
        withPassword: { attributes: {} },
      },
    }
  );

  User.prototype.comparePassword = function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.passwordHash);
  };

  User.associate = (models) => {
    User.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    User.belongsTo(models.Branch, { foreignKey: "branchId", as: "branch" });
    User.belongsTo(models.Role, { foreignKey: "roleId", as: "role" });
  };

  return User;
};
