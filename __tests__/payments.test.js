const { createVendorAndLoginOwner, createMenuItem, closeDb } = require("./helpers");

async function createCompletedBill(agent, branchId, item, quantity = 1) {
  const order = await agent
    .post("/api/orders")
    .send({ branchId, orderType: "takeaway", items: [{ menuItemId: item.id, quantity }] })
    .expect(201);
  for (const status of ["preparing", "ready", "served", "completed"]) {
    await agent.patch(`/api/orders/${order.body.id}/status`).send({ status }).expect(200);
  }
  const bill = await agent.post(`/api/bills/from-order/${order.body.id}`).send({}).expect(201);
  return bill.body;
}

describe("payments and refunds", () => {
  afterAll(closeDb);

  let agent, branchId, item;

  beforeAll(async () => {
    ({ agent, branchId } = await createVendorAndLoginOwner());
    item = await createMenuItem(agent);
  });

  test("recording payments moves a bill unpaid -> partial -> paid", async () => {
    const bill = await createCompletedBill(agent, branchId, item);
    const total = Number(bill.totalAmount);
    const half = Number((total / 2).toFixed(2));

    const first = await agent.post("/api/payments").send({ billId: bill.id, method: "cash", amount: half }).expect(201);
    expect(first.body.bill.paymentStatus).toBe("partial");

    const second = await agent
      .post("/api/payments")
      .send({ billId: bill.id, method: "cash", amount: total - half })
      .expect(201);
    expect(second.body.bill.paymentStatus).toBe("paid");
    expect(Number(second.body.bill.balanceDue)).toBeCloseTo(0, 2);
  });

  test("rejects a payment larger than the remaining balance", async () => {
    const bill = await createCompletedBill(agent, branchId, item);
    const res = await agent
      .post("/api/payments")
      .send({ billId: bill.id, method: "cash", amount: Number(bill.totalAmount) + 1 });
    expect(res.status).toBe(400);
  });

  test("voiding a payment restores the balance", async () => {
    const bill = await createCompletedBill(agent, branchId, item);
    const payment = await agent
      .post("/api/payments")
      .send({ billId: bill.id, method: "cash", amount: bill.totalAmount })
      .expect(201);
    expect(payment.body.bill.paymentStatus).toBe("paid");

    const voided = await agent.delete(`/api/payments/${payment.body.payment.id}`).expect(200);
    expect(voided.body.bill.paymentStatus).toBe("unpaid");
    expect(Number(voided.body.bill.balanceDue)).toBeCloseTo(Number(bill.totalAmount), 2);
  });

  test("partial refund, then full refund, caps correctly and marks the bill refunded", async () => {
    const bill = await createCompletedBill(agent, branchId, item);
    const total = Number(bill.totalAmount);
    const payment = await agent
      .post("/api/payments")
      .send({ billId: bill.id, method: "cash", amount: total })
      .expect(201);
    const paymentId = payment.body.payment.id;

    const half = Number((total / 2).toFixed(2));
    const refund1 = await agent.post(`/api/payments/${paymentId}/refund`).send({ amount: half }).expect(201);
    expect(refund1.body.bill.paymentStatus).toBe("partial");
    expect(Number(refund1.body.bill.amountPaid)).toBeCloseTo(total - half, 2);

    // Omitting `amount` refunds whatever's left refundable on this payment.
    const refund2 = await agent.post(`/api/payments/${paymentId}/refund`).send({}).expect(201);
    expect(refund2.body.bill.paymentStatus).toBe("refunded");
    expect(Number(refund2.body.bill.amountPaid)).toBeCloseTo(0, 2);

    const overRefund = await agent.post(`/api/payments/${paymentId}/refund`).send({});
    expect(overRefund.status).toBe(409);
  });

  test("a refund shows up in the owner-visible audit log", async () => {
    const bill = await createCompletedBill(agent, branchId, item);
    const payment = await agent
      .post("/api/payments")
      .send({ billId: bill.id, method: "cash", amount: bill.totalAmount })
      .expect(201);
    await agent.post(`/api/payments/${payment.body.payment.id}/refund`).send({}).expect(201);

    const log = await agent.get("/api/audit-log").expect(200);
    expect(log.body.entries.some((e) => e.action === "payment.refunded")).toBe(true);
  });

  test("a staff password must meet the strength policy", async () => {
    const roles = await agent.get("/api/roles").expect(200);
    const waiterRole = roles.body.find((r) => r.name === "waiter");
    const res = await agent.post("/api/staff").send({
      firstName: "Weak",
      lastName: "Password",
      email: `weak-${Date.now()}@test.local`,
      roleId: waiterRole.id,
      password: "short",
    });
    expect(res.status).toBe(400);
  });
});
