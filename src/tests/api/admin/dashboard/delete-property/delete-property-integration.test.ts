import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-delete-property");
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const remove = (id: string, token = adminToken) =>
  request(app).delete(`/api/v1/admin/properties/${id}`).set("Authorization", `Bearer ${token}`);

describe("DELETE /api/v1/admin/properties/:id", () => {
  it("hides the property from the admin list and the client page but keeps the row", async () => {
    const property = await fx.createProperty();

    const response = await remove(property.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: property.id, deleted: true });
    const row = await prismaClient.property.findUnique({ where: { id: property.id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);

    const list = await request(app)
      .get(`/api/v1/admin/properties?search=${encodeURIComponent(fx.tag)}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.data.map((p: { id: string }) => p.id)).not.toContain(property.id);
    expect((await request(app).get(`/api/v1/client/properties/${property.id}`)).status).toBe(404);

    // Deleting again is a 404.
    expect((await remove(property.id)).status).toBe(404);
  });

  it("returns 401 without a token and 403 for non-admins", async () => {
    const property = await fx.createProperty();
    expect((await request(app).delete(`/api/v1/admin/properties/${property.id}`)).status).toBe(401);
    expect((await remove(property.id, clientToken)).status).toBe(403);
  });
});
