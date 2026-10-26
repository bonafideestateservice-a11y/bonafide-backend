import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-fcm");
let adminToken: string;
let clientToken: string;
let agent: Awaited<ReturnType<typeof fx.createAgent>>;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
  agent = await fx.createAgent("agent");
});
afterAll(async () => {
  await fx.cleanup(); // FCM tokens are deleted with their users
  await prismaClient.$disconnect();
});

const register = (jwt: string, fcmToken: string) =>
  request(app)
    .post("/api/v1/admin/fcm-token")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ fcmToken });

describe("POST /api/v1/admin/fcm-token", () => {
  it("saves tokens for admins and agents", async () => {
    expect((await register(adminToken, `admin-${fx.tag}`)).status).toBe(200);
    expect((await register(agent.user.token, `agent-${fx.tag}`)).status).toBe(200);
    const saved = await prismaClient.fCMToken.findUniqueOrThrow({
      where: { token: `agent-${fx.tag}` },
    });
    expect(saved).toMatchObject({ userId: agent.userId, isActive: true });
  });

  it("is for admins and agents only", async () => {
    expect((await register(clientToken, `client-${fx.tag}`)).status).toBe(403);
  });
});
