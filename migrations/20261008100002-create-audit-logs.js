"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("audit_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "vendors", key: "id" },
        onDelete: "CASCADE",
      },
      // Nullable: a handful of future system-initiated actions (none today)
      // might not have a human actor. Not a foreign key with onDelete:
      // CASCADE -- a deleted/deactivated user's past actions should stay in
      // the trail, not vanish with them.
      user_id: { type: Sequelize.UUID, allowNull: true },
      action: { type: Sequelize.STRING, allowNull: false },
      entity_type: { type: Sequelize.STRING, allowNull: false },
      entity_id: { type: Sequelize.UUID, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("audit_logs", ["vendor_id", "created_at"], {
      name: "audit_logs_vendor_created_idx",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("audit_logs");
  },
};
