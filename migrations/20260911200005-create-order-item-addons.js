"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("order_item_addons", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "order_items", key: "id" },
        onDelete: "CASCADE",
      },
      addon_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "item_addons", key: "id" },
        onDelete: "SET NULL",
      },
      name_snapshot: { type: Sequelize.STRING, allowNull: false },
      price_snapshot: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("order_item_addons", ["order_item_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("order_item_addons");
  },
};
