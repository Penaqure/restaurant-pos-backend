"use strict";
const crypto = require("crypto");

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert("roles", [
      {
        id: crypto.randomUUID(),
        vendor_id: null,
        name: "super_admin",
        permissions: JSON.stringify(["*"]),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete("roles", { vendor_id: null, name: "super_admin" });
  },
};
