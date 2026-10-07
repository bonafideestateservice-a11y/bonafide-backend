import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("unassign-property-agent");
let adminToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const unassign = (id: string) =>
  request(app)
    .delete(`/api/v1/admin/properties/${id}/assign-agent`)
    .set("Authorization", `Bearer ${adminToken}`);

describe("DELETE /api/v1/admin/properties/:id/assign-agent", () => {
  it("removes the agent, and repeating it changes nothing", async () => {
    const agent = await fx.createAgent("agent");
    const property = await fx.createProperty({ agent: { connect: { id: agent.id } } });

    const first = await unassign(property.id);
    const second = await unassign(property.id);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ id: property.id, agent: null });
    expect(second.status).toBe(200);
    const row = await prismaClient.property.findUnique({ where: { id: property.id } });
    expect(row?.agentId).toBeNull();
  });

  it("returns 404 for deleted and unknown properties and 401 without a token", async () => {
    const deleted = await fx.createProperty({ deletedAt: new Date() });
    expect((await unassign(deleted.id)).status).toBe(404);
    expect((await unassign("missing")).status).toBe(404);
    expect(
      (await request(app).delete(`/api/v1/admin/properties/${deleted.id}/assign-agent`)).status,
    ).toBe(401);
  });
});
