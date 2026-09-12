const { Sequelize } = require("sequelize");
const config = require("./config")[process.env.NODE_ENV || "development"];

const sequelize = new Sequelize(process.env[config.use_env_variable], {
  dialect: config.dialect,
  logging: config.logging,
  dialectOptions: config.dialectOptions,
});

module.exports = sequelize;
