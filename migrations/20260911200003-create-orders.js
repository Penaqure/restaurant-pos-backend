"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("orders", {
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
      table_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "restaurant_tables", key: "id" },
        onDelete: "SET NULL",
      },
      order_number: { type: Sequelize.STRING, allowNull: false },
      order_type: { type: Sequelize.ENUM("dine_in", "takeaway", "delivery"), allowNull: false },
      status: {
        type: Sequelize.ENUM("placed", "preparing", "ready", "served", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "placed",
      },
      customer_name: { type: Sequelize.STRING, allowNull: true },
      customer_phone: { type: Sequelize.STRING, allowNull: true },
      delivery_address: { type: Sequelize.STRING, allowNull: true },
      notes: { type: Sequelize.STRING, allowNull: true },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      discount_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      tax_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      served_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      placed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("orders", ["vendor_id", "branch_id", "order_number"], {
      unique: true,
      name: "orders_vendor_branch_order_number_unique",
    });
    await queryInterface.addIndex("orders", ["branch_id", "status"]);
    await queryInterface.addIndex("orders", ["table_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("orders");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_order_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_status";');
  },
};
