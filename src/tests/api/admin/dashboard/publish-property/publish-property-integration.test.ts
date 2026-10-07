import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("publish-property");
let adminToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const publish = (id: string, body: object) =>
  request(app)
    .patch(`/api/v1/admin/properties/${id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);

describe("PATCH /api/v1/admin/properties/:id/publish", () => {
  it("sets the given state, and repeating it changes nothing", async () => {
    const property = await fx.createProperty({ isPublished: false });

    for (const isPublished of [true, true, false]) {
      const response = await publish(property.id, { isPublished });
      expect(response.status).toBe(200);
      expect(response.body.isPublished).toBe(isPublished);
    }
  });

  it("returns 400 without isPublished", async () => {
    const property = await fx.createProperty();
    expect((await publish(property.id, {})).status).toBe(400);
  });

  it("returns 404 for deleted and unknown properties", async () => {
    const deleted = await fx.createProperty({ deletedAt: new Date() });
    expect((await publish(deleted.id, { isPublished: true })).status).toBe(404);
    expect((await publish("missing", { isPublished: true })).status).toBe(404);
  });
});
