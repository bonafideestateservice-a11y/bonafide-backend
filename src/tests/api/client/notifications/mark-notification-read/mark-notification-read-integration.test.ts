import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-update-read");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const inApp = (userId: string) =>
  prismaClient.notification.create({
    data: { userId, type: "AGENT_ASSIGNED", meta: { channel: "in_app" } },
  });

describe("PATCH /api/v1/client/notifications/:id/read", () => {
  it("marks the client's own notification read", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const notification = await inApp(client.id);

    const response = await request(app)
      .patch(`/api/v1/client/notifications/${notification.id}/read`)
      .set("Authorization", `Bearer ${client.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: notification.id, read: true });
    const row = await prismaClient.notification.findUnique({ where: { id: notification.id } });
    expect(row?.read).toBe(true);
  });

  it("returns 404 for another client's notification and 401 without a token", async () => {
    const owner = await fx.createUser("CLIENT", "owner");
    const other = await fx.createUser("CLIENT", "other");
    const notification = await inApp(owner.id);
    const url = `/api/v1/client/notifications/${notification.id}/read`;

    expect(
      (await request(app).patch(url).set("Authorization", `Bearer ${other.token}`)).status,
    ).toBe(404);
    expect((await request(app).patch(url)).status).toBe(401);
    const row = await prismaClient.notification.findUnique({ where: { id: notification.id } });
    expect(row?.read).toBe(false);
  });
});
