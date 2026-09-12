"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Customer QR self-orders have no staff member behind them.
    await queryInterface.changeColumn("orders", "created_by", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn("orders", "source", {
      type: Sequelize.ENUM("staff", "customer_qr"),
      allowNull: false,
      defaultValue: "staff",
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("orders", "source");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_source";');
    await queryInterface.changeColumn("orders", "created_by", {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};
