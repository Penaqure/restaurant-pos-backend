"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("payments", "type", {
      type: Sequelize.ENUM("payment", "refund"),
      allowNull: false,
      defaultValue: "payment",
    });
    // Points a refund row at the specific payment it's refunding, so a
    // partial refund can be capped at (that payment's amount minus any
    // refunds already recorded against it) rather than against the whole
    // bill. Null for ordinary payment rows.
    await queryInterface.addColumn("payments", "related_payment_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "payments", key: "id" },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("payments", "related_payment_id");
    await queryInterface.removeColumn("payments", "type");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_type";');
  },
};
