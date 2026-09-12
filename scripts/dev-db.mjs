import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

// Local development database — a real Postgres server, just managed by npm
// instead of a system package or Docker, so there's nothing to install to get
// the app running locally. Point DATABASE_URL at a properly installed
// Postgres instance for staging/production; this is dev-only.
const databaseDir = path.join(process.cwd(), ".pgdata");
const alreadyInitialised = existsSync(path.join(databaseDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "billing_user",
  password: "billing_pass",
  port: 5433,
  persistent: true,
});

if (!alreadyInitialised) {
  await pg.initialise();
}
await pg.start();
if (!alreadyInitialised) {
  await pg.createDatabase("restaurant_billing");
}

console.log(
  "Local Postgres ready — postgresql://billing_user:billing_pass@localhost:5433/restaurant_billing"
);

async function shutdown() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
