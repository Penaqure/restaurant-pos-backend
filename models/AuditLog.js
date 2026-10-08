module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    "AuditLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: true },
      // Dotted, e.g. "payment.voided", "discount.created" -- lets the
      // audit-log page filter by prefix as well as exact action.
      action: { type: DataTypes.STRING, allowNull: false },
      entityType: { type: DataTypes.STRING, allowNull: false },
      entityId: { type: DataTypes.UUID, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: "audit_logs",
      underscored: true,
      // Immutable record of what happened -- there's no legitimate "edit"
      // of an audit entry, so only createdAt is tracked.
      updatedAt: false,
    }
  );

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.Vendor, { foreignKey: "vendorId", as: "vendor" });
    AuditLog.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return AuditLog;
};
