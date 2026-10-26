import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-logout");
const fcmToken = `fcm-${fx.tag}`;
let client: { id: string; token: string };
let other: { id: string; token: string };

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  other = await fx.createUser("CLIENT", "other");
  await prismaClient.fCMToken.create({ data: { userId: client.id, token: fcmToken } });
});
afterAll(async () => {
  await fx.cleanup(); // FCM tokens are deleted with their users
  await prismaClient.$disconnect();
});

const logout = (jwt: string, body?: object) =>
  request(app).post("/api/v1/client/logout").set("Authorization", `Bearer ${jwt}`).send(body);

const isActive = async () =>
  (await prismaClient.fCMToken.findUniqueOrThrow({ where: { token: fcmToken } })).isActive;

describe("POST /api/v1/client/logout", () => {
  it("leaves another user's token alone", async () => {
    expect((await logout(other.token, { fcmToken })).status).toBe(200);
    expect(await isActive()).toBe(true);
  });

  it("logs out without an FCM token", async () => {
    const response = await logout(client.token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Logged out." });
    expect(await isActive()).toBe(true);
  });

  it("stops pushes to the browser's token", async () => {
    expect((await logout(client.token, { fcmToken })).status).toBe(200);
    expect(await isActive()).toBe(false);
  });

  it("requires a login", async () => {
    expect((await request(app).post("/api/v1/client/logout").send({})).status).toBe(401);
  });
});
