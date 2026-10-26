import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-fcm");
const fcmToken = `fcm-${fx.tag}`;
let first: { id: string; token: string };
let second: { id: string; token: string };

beforeAll(async () => {
  first = await fx.createUser("CLIENT", "first");
  second = await fx.createUser("CLIENT", "second");
});
afterAll(async () => {
  await fx.cleanup(); // FCM tokens are deleted with their users
  await prismaClient.$disconnect();
});

const register = (jwt: string, body: object) =>
  request(app).post("/api/v1/client/fcm-token").set("Authorization", `Bearer ${jwt}`).send(body);

const saved = () => prismaClient.fCMToken.findUniqueOrThrow({ where: { token: fcmToken } });

describe("POST /api/v1/client/fcm-token", () => {
  it("saves the token for the logged-in user", async () => {
    const response = await register(first.token, { fcmToken });
    expect(response.status).toBe(200);
    expect(await saved()).toMatchObject({ userId: first.id, isActive: true });
  });

  it("is idempotent for the same user", async () => {
    expect((await register(first.token, { fcmToken })).status).toBe(200);
    expect(await prismaClient.fCMToken.count({ where: { token: fcmToken } })).toBe(1);
  });

  it("moves a token to the user who logs in next on the same browser", async () => {
    await prismaClient.fCMToken.update({ where: { token: fcmToken }, data: { isActive: false } });
    expect((await register(second.token, { fcmToken })).status).toBe(200);
    expect(await saved()).toMatchObject({ userId: second.id, isActive: true });
  });

  it("validates the body and requires a login", async () => {
    expect((await register(first.token, {})).status).toBe(400);
    const anonymous = await request(app).post("/api/v1/client/fcm-token").send({ fcmToken });
    expect(anonymous.status).toBe(401);
  });
});
