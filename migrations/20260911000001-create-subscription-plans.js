"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("subscription_plans", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      price_monthly: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      billing_cycle: { type: Sequelize.STRING, allowNull: false, defaultValue: "monthly" },
      max_branches: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      max_users: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("subscription_plans");
  },
};
