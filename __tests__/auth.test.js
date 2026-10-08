const request = require("supertest");
const { app, loginAsSuperAdmin, createVendorAndLoginOwner, closeDb } = require("./helpers");

describe("auth", () => {
  afterAll(closeDb);

  test("rejects a bad password with a generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  test("logs in and sets an httpOnly cookie, not a token in the body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user.email).toBe(process.env.SUPER_ADMIN_EMAIL);
    const cookie = res.headers["set-cookie"].find((c) => c.startsWith("billing_token="));
    expect(cookie).toBeDefined();
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  test("/auth/me requires the session cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("/auth/me works with the cookie from login, and logout ends the session", async () => {
    const agent = await loginAsSuperAdmin();
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.email).toBe(process.env.SUPER_ADMIN_EMAIL);

    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/auth/me").expect(401);
  });

  test("a vendor owner only sees their own vendor's data", async () => {
    const vendorA = await createVendorAndLoginOwner();
    const vendorB = await createVendorAndLoginOwner();

    const resA = await vendorA.agent.get("/api/branches").expect(200);
    const resB = await vendorB.agent.get("/api/branches").expect(200);
    expect(resA.body.every((b) => b.id !== resB.body[0]?.id)).toBe(true);
  });

  test("login is rate-limited after repeated failures", async () => {
    const email = "nobody-rate-limit@test.local";
    let lastStatus;
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app).post("/api/auth/login").send({ email, password: "wrong" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
