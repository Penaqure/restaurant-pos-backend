"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("vendors", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      contact_email: { type: Sequelize.STRING, allowNull: false },
      contact_phone: { type: Sequelize.STRING },
      gstin: { type: Sequelize.STRING },
      plan_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "subscription_plans", key: "id" },
        onDelete: "SET NULL",
      },
      plan_status: {
        type: Sequelize.ENUM("trial", "active", "suspended"),
        allowNull: false,
        defaultValue: "trial",
      },
      plan_renews_at: { type: Sequelize.DATE, allowNull: true },
      default_tax_rate_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      invoice_prefix: { type: Sequelize.STRING, allowNull: false, defaultValue: "INV" },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: "INR" },
      timezone: { type: Sequelize.STRING, allowNull: false, defaultValue: "Asia/Kolkata" },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("vendors");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_vendors_plan_status";');
  },
};
