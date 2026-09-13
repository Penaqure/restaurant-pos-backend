// `sequelize db:seed:all` has no built-in tracking in this project (no
// SequelizeData table configured), so re-running it on every container
// restart would insert duplicate roles/plans. This checks whether the
// platform role already exists and only seeds when the database is
// genuinely fresh -- safe to call on every boot.
require("dotenv").config();
const { execSync } = require("child_process");
const { Role } = require("../models");
const { ROLES } = require("../config/constants");

async function main() {
  const existing = await Role.findOne({ where: { vendorId: null, name: ROLES.SUPER_ADMIN } });
  if (existing) {
    console.log("Seed data already present, skipping.");
    process.exit(0);
  }

  console.log("Fresh database detected -- seeding platform role and starter plan...");
  execSync("npx sequelize-cli db:seed:all", { stdio: "inherit" });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
