module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  setupFiles: ["<rootDir>/__tests__/setupEnv.js"],
  globalSetup: "<rootDir>/__tests__/globalSetup.js",
  // DB-backed tests share one database and aren't written to be
  // parallel-safe against each other -- run serially (see also the
  // `--runInBand` in the npm test script, belt and suspenders).
  maxWorkers: 1,
  testTimeout: 15000,
};
