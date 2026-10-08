const { createVendorAndLoginOwner, createMenuItem, closeDb } = require("./helpers");

describe("order lifecycle and pricing", () => {
  afterAll(closeDb);

  let agent, branchId, item;

  beforeAll(async () => {
    ({ agent, branchId } = await createVendorAndLoginOwner());
    item = await createMenuItem(agent);
    const variant = await agent
      .post(`/api/menu/items/${item.id}/variants`)
      .send({ name: "Large", price: 150 })
      .expect(201);
    const addon = await agent
      .post(`/api/menu/items/${item.id}/addons`)
      .send({ name: "Extra", price: 20 })
      .expect(201);
    item.variantId = variant.body.id || variant.body.variants?.at(-1)?.id;
    item.addonId = addon.body.id || addon.body.addons?.at(-1)?.id;
    if (!item.variantId || !item.addonId) {
      const refreshed = await agent.get(`/api/menu/items/${item.id}`).expect(200);
      item.variantId = item.variantId || refreshed.body.variants[0].id;
      item.addonId = item.addonId || refreshed.body.addons[0].id;
    }
  });

  test("rejects an order with no items", async () => {
    const res = await agent.post("/api/orders").send({ branchId, orderType: "takeaway", items: [] });
    expect(res.status).toBe(400);
  });

  test("prices a variant + addon correctly server-side, ignoring any client-sent price", async () => {
    const res = await agent
      .post("/api/orders")
      .send({
        branchId,
        orderType: "takeaway",
        items: [
          {
            menuItemId: item.id,
            variantId: item.variantId,
            quantity: 2,
            addons: [{ addonId: item.addonId, quantity: 1 }],
            // Deliberately wrong -- must be ignored, pricing always comes
            // from the DB (see orderPricingService.computeOrderLines).
            unitPrice: 1,
          },
        ],
      })
      .expect(201);

    // Addon pricing is per addon-quantity, not multiplied by the line's own
    // item quantity (see computeOrderLines) -- "2x burger + 1x extra cheese"
    // is one shared addon, not two. 2 x 150 + (1 x 20) = 320 subtotal,
    // 5% tax = 16, total 336.
    expect(Number(res.body.subtotal)).toBeCloseTo(320, 2);
    expect(Number(res.body.taxAmount)).toBeCloseTo(16, 2);
    expect(Number(res.body.totalAmount)).toBeCloseTo(336, 2);
  });

  test("rejects an order referencing another item's variant", async () => {
    const otherItem = await createMenuItem(agent, { name: "Other Item" });
    const res = await agent
      .post("/api/orders")
      .send({
        branchId,
        orderType: "takeaway",
        items: [{ menuItemId: otherItem.id, variantId: item.variantId, quantity: 1 }],
      });
    expect(res.status).toBe(400);
  });

  test("enforces the order status state machine", async () => {
    const order = await agent
      .post("/api/orders")
      .send({ branchId, orderType: "takeaway", items: [{ menuItemId: item.id, quantity: 1 }] })
      .expect(201);

    // placed -> ready is not a legal direct transition (must go through preparing).
    const badTransition = await agent.patch(`/api/orders/${order.body.id}/status`).send({ status: "ready" });
    expect(badTransition.status).toBe(409);

    await agent.patch(`/api/orders/${order.body.id}/status`).send({ status: "preparing" }).expect(200);
  });

  test("bill generation requires the order to be completed, and totals match the order", async () => {
    const order = await agent
      .post("/api/orders")
      .send({ branchId, orderType: "takeaway", items: [{ menuItemId: item.id, quantity: 1 }] })
      .expect(201);

    const tooEarly = await agent.post(`/api/bills/from-order/${order.body.id}`).send({});
    expect(tooEarly.status).toBe(409);

    for (const status of ["preparing", "ready", "served", "completed"]) {
      await agent.patch(`/api/orders/${order.body.id}/status`).send({ status }).expect(200);
    }

    const bill = await agent.post(`/api/bills/from-order/${order.body.id}`).send({}).expect(201);
    expect(Number(bill.body.totalAmount)).toBeCloseTo(Number(order.body.totalAmount), 2);

    // A second bill for the same order is rejected, not silently duplicated.
    const dupe = await agent.post(`/api/bills/from-order/${order.body.id}`).send({});
    expect(dupe.status).toBe(409);
  });
});
