"use strict";
const crypto = require("crypto");

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert("subscription_plans", [
      {
        id: crypto.randomUUID(),
        name: "Starter",
        price_monthly: 0,
        billing_cycle: "monthly",
        max_branches: 1,
        max_users: 5,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete("subscription_plans", { name: "Starter" });
  },
};
