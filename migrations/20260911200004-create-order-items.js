"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("order_items", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onDelete: "CASCADE",
      },
      menu_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "menu_items", key: "id" },
        onDelete: "RESTRICT",
      },
      variant_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "item_variants", key: "id" },
        onDelete: "SET NULL",
      },
      item_name_snapshot: { type: Sequelize.STRING, allowNull: false },
      variant_name_snapshot: { type: Sequelize.STRING, allowNull: true },
      unit_price_snapshot: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      tax_rate_percent_snapshot: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      line_total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      notes: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("order_items", ["order_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("order_items");
  },
};
