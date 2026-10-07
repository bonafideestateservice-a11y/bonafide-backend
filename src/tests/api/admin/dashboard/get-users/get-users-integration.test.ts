import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-get-users");
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
  await fx.createAgent("agent", "INACTIVE");
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (query: string, token = adminToken) =>
  request(app).get(`/api/v1/admin/users?${query}`).set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/users", () => {
  it("lists clients and agents matching the search, without admins", async () => {
    const response = await get(`search=${fx.tag}`);

    expect(response.status).toBe(200);
    expect(response.body.counts).toEqual({ all: 2, client: 1, agent: 1 });
    expect(response.body.data.map((u: { type: string }) => u.type).sort()).toEqual([
      "AGENT",
      "CLIENT",
    ]);
    const agent = response.body.data.find((u: { type: string }) => u.type === "AGENT");
    expect(agent).toMatchObject({ status: "SUSPENDED", agentId: expect.any(String) });
  });

  it("filters by type", async () => {
    const response = await get(`search=${fx.tag}&type=client`);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ type: "CLIENT", status: "ACTIVE" });
  });

  it("returns 400 for a bad type, 401 without a token and 403 for non-admins", async () => {
    expect((await get("type=admin")).status).toBe(400);
    expect((await request(app).get("/api/v1/admin/users")).status).toBe(401);
    expect((await get("", clientToken)).status).toBe(403);
  });
});
