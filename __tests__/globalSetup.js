// Runs once, in its own process, before any test file. Creates the test
// database (if it doesn't already exist) and brings it up to date with
// every migration, so each test file starts from a real, current schema
// rather than a hand-maintained fixture that could drift from it.
const { execFileSync } = require("child_process");
const { Client } = require("pg");
const { testDatabaseUrl } = require("./testDbUrl");

module.exports = async () => {
  const testUrl = new URL(testDatabaseUrl());
  const dbName = testUrl.pathname.replace(/^\//, "");

  const adminUrl = new URL(testUrl.toString());
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    // Drop and recreate rather than reusing whatever a previous run left --
    // sequelize-cli's seeders aren't re-run-safe (no "already seeded" guard),
    // so a stale DB from an earlier `npm test` would fail on the unique
    // constraint seed-starter-plan inserts, same as any other leftover state
    // a real CI run shouldn't have to reason about.
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const childEnv = {
    ...process.env,
    DATABASE_URL: testUrl.toString(),
    NODE_ENV: "test",
    SUPER_ADMIN_EMAIL: "super@test.local",
    SUPER_ADMIN_PASSWORD: "TestSuper123",
  };
  const cwd = __dirname + "/..";
  execFileSync("npx", ["sequelize-cli", "db:migrate"], { cwd, env: childEnv, stdio: "inherit" });
  execFileSync("npx", ["sequelize-cli", "db:seed:all"], { cwd, env: childEnv, stdio: "inherit" });
  execFileSync("node", ["utils/scripts/createSuperAdmin.js"], { cwd, env: childEnv, stdio: "inherit" });
};
