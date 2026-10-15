import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-updates-read-all");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("PATCH /api/v1/client/notifications/read-all", () => {
  it("marks only the client's unread in-app notifications read", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const other = await fx.createUser("CLIENT", "other");
    const inApp = { type: "AGENT_ASSIGNED" as const, meta: { channel: "in_app" } };
    await prismaClient.notification.createMany({
      data: [
        { ...inApp, userId: client.id },
        { ...inApp, userId: client.id },
        { ...inApp, userId: other.id },
      ],
    });

    const response = await request(app)
      .patch("/api/v1/client/notifications/read-all")
      .set("Authorization", `Bearer ${client.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updated: 2 });
    expect(
      await prismaClient.notification.count({ where: { userId: other.id, read: false } }),
    ).toBe(1);
  });

  it("returns 401 without a token", async () => {
    expect((await request(app).patch("/api/v1/client/notifications/read-all")).status).toBe(401);
  });
});
