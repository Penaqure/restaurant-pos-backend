"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("vendors", "country", {
      type: Sequelize.STRING(5),
      allowNull: false,
      defaultValue: "IN",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("vendors", "country");
  },
};
