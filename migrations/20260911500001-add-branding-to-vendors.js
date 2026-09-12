"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("vendors", "logo_url", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("vendors", "brand_color", {
      type: Sequelize.STRING(7),
      allowNull: false,
      defaultValue: "#5a3ff0",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("vendors", "logo_url");
    await queryInterface.removeColumn("vendors", "brand_color");
  },
};
