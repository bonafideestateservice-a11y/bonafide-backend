import request from "supertest";
import app from "../../../../../app";
import { hashPassword } from "../../../../../utils/password";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-user-status");
let adminToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const setStatus = (id: string, status: string) =>
  request(app)
    .patch(`/api/v1/admin/users/${id}/status`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status });

describe("PATCH /api/v1/admin/users/:id/status", () => {
  it("blocks a suspended client's login and token until reactivated", async () => {
    const client = await fx.createUser("CLIENT", "client");
    await prismaClient.user.update({
      where: { id: client.id },
      data: { password: await hashPassword("Secret123!") },
    });
    const login = () =>
      request(app)
        .post("/api/v1/client/login")
        .send({ email: client.email, password: "Secret123!" });
    const useToken = () =>
      request(app)
        .get("/api/v1/client/verification-requests")
        .set("Authorization", `Bearer ${client.token}`);

    const suspended = await setStatus(client.id, "SUSPENDED");
    expect(suspended.status).toBe(200);
    expect(suspended.body).toEqual({
      id: client.id,
      status: "SUSPENDED",
      reassigned: 0,
      unassigned: 0,
    });
    expect((await login()).status).toBe(403);
    expect((await useToken()).status).toBe(403);

    await setStatus(client.id, "ACTIVE");
    expect((await login()).status).toBe(200);
    expect((await useToken()).status).toBe(200);
  });

  it("suspends an agent's user and agent record and moves their open job", async () => {
    const client = await fx.createUser("CLIENT", "owner");
    const agent = await fx.createAgent("agent");
    await fx.giveOpenJobs(agent.id, client.id, 1);

    const response = await setStatus(agent.userId, "SUSPENDED");

    expect(response.status).toBe(200);
    expect(response.body.reassigned + response.body.unassigned).toBe(1);
    const [user, record] = await Promise.all([
      prismaClient.user.findUnique({ where: { id: agent.userId } }),
      prismaClient.verificationAgent.findUnique({ where: { id: agent.id } }),
    ]);
    expect(user?.status).toBe("SUSPENDED");
    expect(record?.status).toBe("INACTIVE");
  });

  it("returns 404 for admins and unknown users and 400 for a bad status", async () => {
    const admin = await fx.createUser("ADMIN", "other-admin");
    expect((await setStatus(admin.id, "SUSPENDED")).status).toBe(404);
    expect((await setStatus("missing", "SUSPENDED")).status).toBe(404);
    expect((await setStatus(admin.id, "BANNED")).status).toBe(400);
  });
});
