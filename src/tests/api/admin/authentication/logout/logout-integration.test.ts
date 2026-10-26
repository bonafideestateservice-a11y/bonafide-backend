import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-logout");
const fcmToken = `fcm-${fx.tag}`;
let admin: { id: string; token: string };

beforeAll(async () => {
  admin = await fx.createUser("ADMIN", "admin");
  await prismaClient.fCMToken.create({ data: { userId: admin.id, token: fcmToken } });
});
afterAll(async () => {
  await fx.cleanup(); // FCM tokens are deleted with their users
  await prismaClient.$disconnect();
});

describe("POST /api/v1/admin/logout", () => {
  it("stops pushes to the browser's token", async () => {
    const response = await request(app)
      .post("/api/v1/admin/logout")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ fcmToken });
    expect(response.status).toBe(200);
    const saved = await prismaClient.fCMToken.findUniqueOrThrow({ where: { token: fcmToken } });
    expect(saved.isActive).toBe(false);
  });

  it("requires a login", async () => {
    expect((await request(app).post("/api/v1/admin/logout").send({})).status).toBe(401);
  });
});
