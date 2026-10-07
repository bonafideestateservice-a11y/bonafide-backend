import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("assign-property-agent");
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

const assign = (id: string, agentId: string, token = adminToken) =>
  request(app)
    .post(`/api/v1/admin/properties/${id}/assign-agent`)
    .set("Authorization", `Bearer ${token}`)
    .send({ agentId });

describe("POST /api/v1/admin/properties/:id/assign-agent", () => {
  it("assigns the agent, replacing the previous one", async () => {
    const [first, second] = [await fx.createAgent("first"), await fx.createAgent("second")];
    const property = await fx.createProperty();

    await assign(property.id, first.id);
    const response = await assign(property.id, second.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: property.id,
      agent: { id: second.id, name: second.name },
    });
    const row = await prismaClient.property.findUnique({ where: { id: property.id } });
    expect(row?.agentId).toBe(second.id);

    // It shows on the property's detail page.
    const detail = await request(app)
      .get(`/api/v1/admin/properties/${property.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detail.body.agent).toEqual({ id: second.id, name: second.name });
  });

  it("returns 400 for a suspended agent and 404 for unknown agents and properties", async () => {
    const suspended = await fx.createAgent("suspended", "INACTIVE");
    const active = await fx.createAgent("active");
    const property = await fx.createProperty();
    const deleted = await fx.createProperty({ deletedAt: new Date() });

    expect((await assign(property.id, suspended.id)).status).toBe(400);
    expect((await assign(property.id, "missing")).status).toBe(404);
    expect((await assign(deleted.id, active.id)).status).toBe(404);
    expect((await assign("missing", active.id)).status).toBe(404);
  });

  it("returns 409 once the agent has 5 properties, not counting deleted ones", async () => {
    const agent = await fx.createAgent("full");
    const assigned = { agent: { connect: { id: agent.id } } };
    const mine = [];
    for (let i = 0; i < 5; i += 1) mine.push(await fx.createProperty(assigned));
    await fx.createProperty({ ...assigned, deletedAt: new Date() });
    const another = await fx.createProperty();

    const full = await assign(another.id, agent.id);
    expect(full.status).toBe(409);
    expect(full.body.message).toBe(
      "Agent is fully booked. Agents can only handle 5 properties at a time.",
    );
    // Re-assigning one of their own properties is still allowed.
    expect((await assign(mine[0].id, agent.id)).status).toBe(200);
    // Freeing one makes room.
    await request(app)
      .delete(`/api/v1/admin/properties/${mine[1].id}/assign-agent`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect((await assign(another.id, agent.id)).status).toBe(200);
  });

  it("returns 403 for non-admins", async () => {
    const agent = await fx.createAgent("other");
    const property = await fx.createProperty();
    expect((await assign(property.id, agent.id, clientToken)).status).toBe(403);
  });
});
