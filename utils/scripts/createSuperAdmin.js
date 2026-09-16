require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Role, User } = require("../../models");
const { ROLES } = require("../../config/constants");
const { isStrongPassword, PASSWORD_POLICY_MESSAGE } = require("../passwordPolicy");

const BCRYPT_ROUNDS = 12;

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }
  if (!isStrongPassword(password)) {
    console.error(`SUPER_ADMIN_PASSWORD is too weak: ${PASSWORD_POLICY_MESSAGE}`);
    process.exit(1);
  }

  const role = await Role.findOne({ where: { vendorId: null, name: ROLES.SUPER_ADMIN } });
  if (!role) {
    console.error("super_admin role not found -- run `npm run db:seed:all` first");
    process.exit(1);
  }

  const existing = await User.findOne({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await User.create({
    vendorId: null,
    branchId: null,
    roleId: role.id,
    firstName: "Super",
    lastName: "Admin",
    email: email.toLowerCase(),
    passwordHash,
  });

  console.log(`Super admin created: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
