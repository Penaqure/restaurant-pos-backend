const request = require("supertest");
const app = require("../app");

// A fresh vendor + owner per call (unique email via the counter) rather
// than one shared fixture -- keeps tests independent of each other and of
// run order, the same way the manual smoke-testing earlier in this app's
// development did.
let counter = 0;
function uniqueSuffix() {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

async function loginAsSuperAdmin() {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD })
    .expect(200);
  return agent;
}

// Creates a vendor (with its default branch/roles) via the real platform
// API, then logs in as its owner -- returns an authenticated supertest
// agent plus the ids tests commonly need.
async function createVendorAndLoginOwner(overrides = {}) {
  const suffix = uniqueSuffix();
  const superAgent = await loginAsSuperAdmin();
  const ownerEmail = `owner-${suffix}@test.local`;
  const ownerPassword = "TestOwner123";

  const createRes = await superAgent
    .post("/api/platform/vendors")
    .send({
      vendorName: `Test Vendor ${suffix}`,
      contactEmail: `vendor-${suffix}@test.local`,
      ownerFirstName: "Test",
      ownerLastName: "Owner",
      ownerEmail,
      ownerPassword,
      ...overrides,
    })
    .expect(201);

  const ownerAgent = request.agent(app);
  await ownerAgent.post("/api/auth/login").send({ email: ownerEmail, password: ownerPassword }).expect(200);

  const branchesRes = await ownerAgent.get("/api/branches").expect(200);

  return {
    agent: ownerAgent,
    vendorId: createRes.body.vendor.id,
    branchId: branchesRes.body[0].id,
  };
}

// Builds one sellable menu item (with a tax rate and category already
// wired up) so order/bill tests don't each have to repeat the setup.
async function createMenuItem(agent, overrides = {}) {
  const taxRes = await agent.post("/api/menu/tax-rates").send({ name: "Test GST", ratePercent: 5 }).expect(201);
  const catRes = await agent.post("/api/menu/categories").send({ name: "Test Category", sortOrder: 1 }).expect(201);
  const itemRes = await agent
    .post("/api/menu/items")
    .send({
      name: "Test Item",
      categoryId: catRes.body.id,
      basePrice: 100,
      taxRateId: taxRes.body.id,
      isAvailable: true,
      ...overrides,
    })
    .expect(201);
  return itemRes.body;
}

// Each test file gets its own module registry (and so its own Sequelize
// connection pool) in Jest -- without closing it, the pool's open socket
// keeps that file's process alive past the test run.
function closeDb() {
  return require("../models").sequelize.close();
}

module.exports = { app, loginAsSuperAdmin, createVendorAndLoginOwner, createMenuItem, uniqueSuffix, closeDb };
