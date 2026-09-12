"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("payments", {
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
      bill_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "bills", key: "id" },
        onDelete: "CASCADE",
      },
      method: { type: Sequelize.ENUM("cash", "card", "upi", "wallet", "other"), allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      reference_number: { type: Sequelize.STRING, allowNull: true },
      status: { type: Sequelize.ENUM("recorded", "void"), allowNull: false, defaultValue: "recorded" },
      recorded_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      paid_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      notes: { type: Sequelize.STRING, allowNull: true },
      gateway_name: { type: Sequelize.STRING, allowNull: true },
      gateway_transaction_id: { type: Sequelize.STRING, allowNull: true },
      gateway_payload: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("payments", ["bill_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("payments");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_method";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_status";');
  },
};
