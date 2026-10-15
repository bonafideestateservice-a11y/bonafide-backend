import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("purchase-request");
let client: Awaited<ReturnType<typeof fx.createUser>>;

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
});
afterAll(async () => {
  await prismaClient.idempotencyKey.deleteMany({ where: { userId: client.id } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const submit = (propertyId: string, key?: string) => {
  const call = request(app)
    .post(`/api/v1/client/properties/${propertyId}/purchase-requests`)
    .set("Authorization", `Bearer ${client.token}`);
  return key ? call.set("Idempotency-Key", key) : call;
};

describe("POST /api/v1/client/properties/:id/purchase-requests", () => {
  it("creates a submitted purchase request with no payment yet", async () => {
    const property = await fx.createProperty({ name: `Lekki Apartment ${fx.tag}` });

    const response = await submit(property.id);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reference: expect.stringMatching(/^BF-PUR-\d{6}$/),
      type: "PURCHASE",
      status: "SUBMITTED",
      statusLabel: "Request submitted",
      payment: null,
      property: { id: property.id, title: `Lekki Apartment ${fx.tag}` },
    });
    expect(response.body.steps.map((s: { status: string }) => s.status)).toEqual([
      "SUBMITTED",
      "CONSULTATION",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
    expect(response.body.steps[0]).toMatchObject({ current: true, reachedAt: expect.any(String) });
  });

  it("returns the open request instead of a duplicate", async () => {
    const property = await fx.createProperty();
    const first = await submit(property.id);
    const second = await submit(property.id);

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await prismaClient.propertyRequest.count({ where: { propertyId: property.id } })).toBe(
      1,
    );
  });

  it("replays the first response for a repeated Idempotency-Key", async () => {
    const property = await fx.createProperty();
    const key = `key-${fx.tag}`;
    const first = await submit(property.id, key);
    const replay = await submit(property.id, key);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body.id).toBe(first.body.id);
  });

  it("returns 404 for unpublished properties and 401 without a token", async () => {
    const draft = await fx.createProperty({ isPublished: false });
    expect((await submit(draft.id)).status).toBe(404);
    expect(
      (await request(app).post(`/api/v1/client/properties/${draft.id}/purchase-requests`)).status,
    ).toBe(401);
  });
});
