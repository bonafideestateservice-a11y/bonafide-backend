import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("property-request-status");
let adminToken: string;
let clientId: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientId = (await fx.createUser("CLIENT", "client")).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const setStatus = (id: string, body: object) =>
  request(app)
    .patch(`/api/v1/admin/property-requests/${id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);

describe("PATCH /api/v1/admin/property-requests/:id/status", () => {
  it("walks a purchase through its steps and opens the payment at IN_PROGRESS", async () => {
    const purchase = await fx.createPurchase(clientId, "SUBMITTED");

    const consultation = await setStatus(purchase.id, {
      status: "CONSULTATION",
      note: "Call booked",
    });
    expect(consultation.status).toBe(200);
    expect(consultation.body).toMatchObject({ status: "CONSULTATION", payment: null });

    const inProgress = await setStatus(purchase.id, { status: "IN_PROGRESS" });
    expect(inProgress.body).toMatchObject({
      status: "IN_PROGRESS",
      payment: { status: "READY", amount: 85000000, currency: "NGN" },
    });
    expect(inProgress.body.updates).toEqual([
      expect.objectContaining({ status: "SUBMITTED" }),
      expect.objectContaining({
        status: "CONSULTATION",
        kind: "MILESTONE",
        title: "Consultation",
        message: "Call booked",
      }),
      expect.objectContaining({ status: "IN_PROGRESS", kind: "PROGRESS" }),
    ]);

    const transfer = await setStatus(purchase.id, { status: "OWNERSHIP_TRANSFER" });
    expect(transfer.body).toMatchObject({
      status: "OWNERSHIP_TRANSFER",
      statusLabel: "Ownership transfer",
    });
    expect(transfer.body.steps.find((s: { current: boolean }) => s.current).status).toBe(
      "OWNERSHIP_TRANSFER",
    );

    const completed = await setStatus(purchase.id, { status: "COMPLETED" });
    expect(completed.body.steps.every((s: { done: boolean }) => s.done)).toBe(true);
    // Finished requests can't change.
    expect((await setStatus(purchase.id, { status: "CANCELLED" })).status).toBe(409);
  });

  it("only creates one payment, even if IN_PROGRESS is set twice", async () => {
    const purchase = await fx.createPurchase(clientId, "IN_PROGRESS");
    await setStatus(purchase.id, { status: "CONSULTATION" });
    await setStatus(purchase.id, { status: "IN_PROGRESS" });
    expect(await prismaClient.propertyPayment.count({ where: { requestId: purchase.id } })).toBe(1);
  });

  it("doesn't let a consultation become IN_PROGRESS or OWNERSHIP_TRANSFER", async () => {
    const consultation = await fx.createPurchase(clientId, "SUBMITTED", "CONSULTATION");
    expect((await setStatus(consultation.id, { status: "IN_PROGRESS" })).status).toBe(400);
    expect((await setStatus(consultation.id, { status: "OWNERSHIP_TRANSFER" })).status).toBe(400);
  });

  it("sends the client an in-app notification for each status change", async () => {
    const purchase = await fx.createPurchase(clientId, "SUBMITTED");
    await setStatus(purchase.id, { status: "CONSULTATION", note: "We'll call you on Monday." });
    await setStatus(purchase.id, { status: "OWNERSHIP_TRANSFER" }); // skipping ahead is allowed

    const notifications = await prismaClient.notification.findMany({
      where: {
        userId: clientId,
        type: "PROPERTY_REQUEST_UPDATED",
        meta: { path: ["propertyRequestId"], equals: purchase.id },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(notifications.map((n) => [n.title, n.body])).toEqual([
      ["Consultation", "We'll call you on Monday."],
      ["Ownership transfer", expect.stringMatching(/^Bonafide is handling the ownership transfer/)],
    ]);
    expect(notifications[0].meta).toMatchObject({
      channel: "in_app",
      reference: purchase.reference,
    });

    // They appear on the client's Updates screen, linked to the request.
    const client = await prismaClient.user.findUniqueOrThrow({ where: { id: clientId } });
    const updates = await request(app)
      .get("/api/v1/client/notifications")
      .set("Authorization", `Bearer ${generateToken({ id: client.id })}`);
    expect(updates.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "PROPERTY_REQUEST_UPDATED",
          title: "Ownership transfer",
          propertyRequestId: purchase.id,
        }),
      ]),
    );
  });

  it("returns 404 for an unknown request", async () => {
    expect((await setStatus("missing", { status: "CONSULTATION" })).status).toBe(404);
  });
});
