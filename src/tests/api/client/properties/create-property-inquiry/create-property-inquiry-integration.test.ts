import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-property-inquiry");
let token: string;

beforeAll(async () => {
  token = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const inquire = (id: string, body: object) =>
  request(app)
    .post(`/api/v1/client/properties/${id}/inquiries`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("POST /api/v1/client/properties/:id/inquiries", () => {
  it("saves the inquiry", async () => {
    const property = await fx.createProperty();

    const response = await inquire(property.id, { message: "Is it available?" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ propertyId: property.id, message: "Is it available?" });
    expect(await prismaClient.propertyInquiry.count({ where: { propertyId: property.id } })).toBe(
      1,
    );
  });

  it("returns 400 without a message", async () => {
    const property = await fx.createProperty();
    expect((await inquire(property.id, {})).status).toBe(400);
  });

  it("returns 404 for unpublished properties", async () => {
    const draft = await fx.createProperty({ isPublished: false });
    expect((await inquire(draft.id, { message: "Hi" })).status).toBe(404);
  });

  it("returns 401 without a token", async () => {
    const property = await fx.createProperty();
    const response = await request(app)
      .post(`/api/v1/client/properties/${property.id}/inquiries`)
      .send({ message: "Hi" });
    expect(response.status).toBe(401);
  });
});
