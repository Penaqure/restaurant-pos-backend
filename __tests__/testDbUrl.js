require("dotenv").config();

// Same Postgres server/credentials as local dev, just a separate database --
// so running the suite never touches (or needs) the dev DB's own data.
function testDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL must be set (see .env.example) to run tests");
  const url = new URL(base);
  url.pathname = "/" + url.pathname.replace(/^\//, "") + "_test";
  return url.toString();
}

module.exports = { testDatabaseUrl };
