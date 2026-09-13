"use strict";
const crypto = require("crypto");

// Vendors created before the kitchen role existed never got one seeded via
// VENDOR_ROLE_DEFAULTS (that only runs at vendor creation), so backfill it
// for every vendor here.
module.exports = {
  up: async (queryInterface) => {
    const vendors = await queryInterface.sequelize.query('SELECT id FROM vendors', {
      type: queryInterface.sequelize.QueryTypes.SELECT,
    });
    if (vendors.length === 0) return;

    const now = new Date();
    await queryInterface.bulkInsert(
      "roles",
      vendors.map((v) => ({
        id: crypto.randomUUID(),
        vendor_id: v.id,
        name: "kitchen",
        permissions: JSON.stringify(["orders:view", "orders:status"]),
        created_at: now,
        updated_at: now,
      }))
    );
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete("roles", { name: "kitchen" });
  },
};
