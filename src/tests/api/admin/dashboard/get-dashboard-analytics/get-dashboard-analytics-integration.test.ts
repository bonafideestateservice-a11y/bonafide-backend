import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("analytics");
let token: string;

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
  const client = await fx.createUser("CLIENT", "client");
  await fx.createPaidRequest(client.id);
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (query = "") =>
  request(app)
    .get(`/api/v1/admin/dashboard/analytics${query}`)
    .set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/dashboard/analytics", () => {
  it("counts today's payment in this week's chart", async () => {
    const response = await get("?range=this_week");
    expect(response.status).toBe(200);
    expect(response.body.points).toHaveLength(7);
    expect(response.body.points.map((p: { label: string }) => p.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    const today = new Date().toISOString().slice(0, 10);
    expect(
      response.body.points.find((p: { date: string }) => p.date === today).count,
    ).toBeGreaterThanOrEqual(1);
  });

  it("returns one point per day of the month", async () => {
    const response = await get("?range=this_month");
    expect(response.status).toBe(200);
    expect(response.body.points[0].label).toBe("1");
    expect(response.body.points.length).toBeGreaterThanOrEqual(28);
  });

  it("returns last week without today's payment", async () => {
    const response = await get("?range=last_week");
    const today = new Date().toISOString().slice(0, 10);
    expect(response.body.points.some((p: { date: string }) => p.date === today)).toBe(false);
  });

  it("rejects an unknown range and non-admins", async () => {
    expect((await get("?range=year")).status).toBe(400);
    const client = await fx.createUser("CLIENT", "other");
    const response = await request(app)
      .get("/api/v1/admin/dashboard/analytics")
      .set("Authorization", `Bearer ${client.token}`);
    expect(response.status).toBe(403);
  });
});
