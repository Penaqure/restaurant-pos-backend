"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("counters", {
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
        allowNull: true,
        references: { model: "branches", key: "id" },
        onDelete: "CASCADE",
      },
      counter_type: { type: Sequelize.ENUM("order", "bill"), allowNull: false },
      current_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("counters", ["vendor_id", "branch_id", "counter_type"], {
      unique: true,
      name: "counters_vendor_branch_type_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("counters");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_counters_counter_type";');
  },
};
