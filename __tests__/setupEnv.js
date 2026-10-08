// Runs once per test file, before that file's own `require`s -- so
// `require("../models")` (directly, or via a controller/route) sees the
// test database URL rather than the dev one. A real, long, non-placeholder
// value is also needed here since app.js's own startup guard checks it.
const { testDatabaseUrl } = require("./testDbUrl");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET = "test-only-secret-0123456789abcdef0123456789abcdef";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.COOKIE_SECURE = "false";
process.env.BACKUP_ENABLED = "false";
// Matches what globalSetup.js creates the super admin with.
process.env.SUPER_ADMIN_EMAIL = "super@test.local";
process.env.SUPER_ADMIN_PASSWORD = "TestSuper123";
