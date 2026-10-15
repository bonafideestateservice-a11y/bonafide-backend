import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("property-request-detail");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/client/property-requests/:id", () => {
  it("shows progress, updates and the ready payment for a purchase in progress", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const purchase = await fx.createPurchase(client.id, "IN_PROGRESS");

    const response = await request(app)
      .get(`/api/v1/client/property-requests/${purchase.id}`)
      .set("Authorization", `Bearer ${client.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "IN_PROGRESS",
      statusLabel: "Purchase in progress",
      payment: {
        reference: purchase.reference.replace("BF-PUR", "BF-PAY"),
        amount: 85000000,
        currency: "NGN",
        status: "READY",
        checkoutUrl: null,
      },
    });
    expect(response.body.steps).toEqual([
      expect.objectContaining({ status: "SUBMITTED", done: true }),
      expect.objectContaining({ status: "CONSULTATION", done: true, reachedAt: null }),
      expect.objectContaining({
        status: "IN_PROGRESS",
        current: true,
        reachedAt: expect.any(String),
      }),
      expect.objectContaining({ status: "OWNERSHIP_TRANSFER", done: false, reachedAt: null }),
      expect.objectContaining({ status: "COMPLETED", done: false, reachedAt: null }),
    ]);
    expect(response.body.updates).toEqual([
      expect.objectContaining({ status: "SUBMITTED", kind: "MILESTONE" }),
      expect.objectContaining({
        status: "IN_PROGRESS",
        kind: "PROGRESS",
        title: "Purchase in progress",
        message: expect.stringMatching(/^Bonafide is facilitating your purchase of /),
      }),
    ]);
  });

  it("returns 404 for another client's request", async () => {
    const owner = await fx.createUser("CLIENT", "owner");
    const other = await fx.createUser("CLIENT", "other");
    const purchase = await fx.createPurchase(owner.id, "SUBMITTED");
    const response = await request(app)
      .get(`/api/v1/client/property-requests/${purchase.id}`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(response.status).toBe(404);
  });
});
