"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("restaurant_tables", {
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
      name: { type: Sequelize.STRING, allowNull: false },
      capacity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 4 },
      status: {
        type: Sequelize.ENUM("available", "occupied", "reserved", "cleaning"),
        allowNull: false,
        defaultValue: "available",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("restaurant_tables", ["branch_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("restaurant_tables");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_restaurant_tables_status";');
  },
};
