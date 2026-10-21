import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("consultation-request");
let client: Awaited<ReturnType<typeof fx.createUser>>;

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const consult = (propertyId: string) =>
  request(app)
    .post(`/api/v1/client/properties/${propertyId}/consultations`)
    .set("Authorization", `Bearer ${client.token}`);

describe("POST /api/v1/client/properties/:id/consultations", () => {
  it("creates a consultation request alongside an open purchase request", async () => {
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");

    const response = await consult(purchase.property.id);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reference: expect.stringMatching(/^BF-CON-\d{6}$/),
      type: "CONSULTATION",
      status: "SUBMITTED",
      payment: null,
    });
    expect(response.body.steps.map((s: { status: string }) => s.status)).toEqual([
      "SUBMITTED",
      "CONSULTATION",
      "COMPLETED",
    ]);
    // A second consultation for the same property returns the open one.
    expect((await consult(purchase.property.id)).body.id).toBe(response.body.id);
  });

  it("tells admins about the consultation request", async () => {
    const admin = await fx.createUser("ADMIN", "admin");
    const property = await fx.createProperty();
    await consult(property.id);
    const notification = await prismaClient.notification.findFirstOrThrow({
      where: { userId: admin.id, type: "PROPERTY_REQUEST_CREATED" },
    });
    expect(notification.title).toBe("New consultation request");
    expect(notification.body).toContain("requested a consultation about");
  });

  it("allows a new consultation once the last one is completed", async () => {
    const done = await fx.createPurchase(client.id, "COMPLETED", "CONSULTATION");
    const response = await consult(done.property.id);
    expect(response.status).toBe(201);
    expect(response.body.id).not.toBe(done.id);
  });

  it("returns 404 for an unknown property", async () => {
    expect((await consult("missing")).status).toBe(404);
  });
});
