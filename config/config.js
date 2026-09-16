require("dotenv").config();

const base = {
  use_env_variable: "DATABASE_URL",
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    // Guards every connection against a runaway/hung query (e.g. a heavy
    // report aggregation, or a client that dropped mid-transaction) tying
    // up a pool slot indefinitely -- app-level rate limiting caps request
    // *rate*, this caps how long any single one can hold a DB connection.
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 30_000,
  },
};

// SSL is opt-in via DB_SSL rather than tied to NODE_ENV=production: the
// docker-compose deployment (README's documented path) runs NODE_ENV=production
// against the *bundled* postgres container over the compose-internal network,
// which doesn't have SSL enabled -- forcing `ssl.require: true` there makes
// every connection attempt fail with "the server does not support SSL
// connections". Set DB_SSL=true only when DATABASE_URL points at a Postgres
// that actually terminates TLS (e.g. a managed/remote instance reached over
// an untrusted network).
const withSsl = {
  ...base,
  dialectOptions: {
    ...base.dialectOptions,
    ssl: {
      require: true,
      // Defaults to verifying the server's certificate; only disable when
      // the target genuinely uses a cert this Node process has no CA for
      // (common with some managed providers) -- understand that this drops
      // MITM protection on that connection before doing so.
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    },
  },
};

module.exports = {
  development: base,
  test: base,
  production: process.env.DB_SSL === "true" ? withSsl : base,
};
