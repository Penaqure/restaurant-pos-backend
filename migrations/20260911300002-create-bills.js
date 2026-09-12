"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("bills", {
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
      branch_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "branches", key: "id" },
        onDelete: "CASCADE",
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "orders", key: "id" },
        onDelete: "RESTRICT",
      },
      bill_number: { type: Sequelize.STRING, allowNull: false },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      discount_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "discounts", key: "id" },
        onDelete: "SET NULL",
      },
      discount_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      tax_breakdown: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      tax_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      round_off_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      amount_paid: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      balance_due: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      payment_status: {
        type: Sequelize.ENUM("unpaid", "partial", "paid", "refunded"),
        allowNull: false,
        defaultValue: "unpaid",
      },
      status: {
        type: Sequelize.ENUM("draft", "finalized", "void"),
        allowNull: false,
        defaultValue: "finalized",
      },
      pdf_url: { type: Sequelize.STRING, allowNull: true },
      generated_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      generated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("bills", ["vendor_id", "branch_id", "bill_number"], {
      unique: true,
      name: "bills_vendor_branch_bill_number_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("bills");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_bills_payment_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_bills_status";');
  },
};
