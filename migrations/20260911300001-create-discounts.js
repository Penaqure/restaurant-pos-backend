"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("discounts", {
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
      code: { type: Sequelize.STRING, allowNull: false },
      type: { type: Sequelize.ENUM("percentage", "flat"), allowNull: false },
      value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      min_order_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      valid_from: { type: Sequelize.DATE, allowNull: true },
      valid_to: { type: Sequelize.DATE, allowNull: true },
      usage_limit: { type: Sequelize.INTEGER, allowNull: true },
      usage_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("discounts", ["vendor_id", "code"], {
      unique: true,
      name: "discounts_vendor_code_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("discounts");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_discounts_type";');
  },
};
