import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("agents");
let token: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
  const client = await fx.createUser("CLIENT", "client");
  ids.available = (await fx.createAgent("available")).id;
  ids.busy = (await fx.createAgent("busy")).id;
  ids.suspended = (await fx.createAgent("suspended", "INACTIVE")).id;
  await fx.giveOpenJobs(ids.available, client.id, 2);
  await fx.giveOpenJobs(ids.busy, client.id, 5);
  await fx.createProperty({ agent: { connect: { id: ids.available } } });
  await fx.createProperty({ agent: { connect: { id: ids.available } }, deletedAt: new Date() });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (query: string) =>
  request(app)
    .get(`/api/v1/admin/agents?search=${fx.tag}${query}`)
    .set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/agents", () => {
  it("returns every agent with email, status and open jobs", async () => {
    const response = await get("");
    expect(response.status).toBe(200);
    const byId = Object.fromEntries(response.body.data.map((a: { id: string }) => [a.id, a]));
    expect(byId[ids.available]).toMatchObject({
      displayStatus: "AVAILABLE",
      activeAssignments: 2,
      assignedPropertyCount: 1, // the deleted property doesn't count
      email: expect.stringContaining("available-"),
    });
    expect(byId[ids.busy]).toMatchObject({ displayStatus: "BUSY", activeAssignments: 5 });
    expect(byId[ids.suspended]).toMatchObject({ displayStatus: "SUSPENDED", activeAssignments: 0 });
    expect(response.body.counts).toEqual({ all: 3, active: 1, busy: 1, suspended: 1 });
  });

  it.each([
    ["active", "available"],
    ["busy", "busy"],
  ])("tab=%s lists only %s agents", async (tab, key) => {
    const response = await get(`&tab=${tab}`);
    expect(response.body.data.map((a: { id: string }) => a.id)).toEqual([ids[key]]);
  });

  it("rejects an unknown tab", async () => {
    expect((await get("&tab=nope")).status).toBe(400);
  });
});
