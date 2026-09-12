"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("menu_items", {
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
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "menu_categories", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.STRING },
      base_price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      image_url: { type: Sequelize.STRING },
      is_veg: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      is_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      tax_rate_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "tax_rates", key: "id" },
        onDelete: "SET NULL",
      },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("menu_items", ["vendor_id"]);
    await queryInterface.addIndex("menu_items", ["category_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("menu_items");
  },
};
