"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("vendors", "default_bill_size", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "a4",
    });
    await queryInterface.addColumn("vendors", "bill_show_gst", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn("vendors", "bill_show_logo", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn("vendors", "bill_footer_note", {
      type: Sequelize.STRING(280),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("vendors", "default_bill_size");
    await queryInterface.removeColumn("vendors", "bill_show_gst");
    await queryInterface.removeColumn("vendors", "bill_show_logo");
    await queryInterface.removeColumn("vendors", "bill_footer_note");
  },
};
