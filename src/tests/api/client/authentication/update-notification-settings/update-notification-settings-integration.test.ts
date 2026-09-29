import express from "express";
import request from "supertest";
import clientAuthenticationRoutes from "../../../../../api/client/authentication";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { prismaClient } from "../../../../../utils/prisma";
import { generateToken } from "../../../../../utils/jwt";

const app = express();
app.use(express.json());
app.use("/api/v1/client", clientAuthenticationRoutes);

const suffix = Date.now();
let userId: string;
let token: string;

describe("Client notification settings endpoint (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: `client-notification-settings-${suffix}@example.com`,
      fullName: "Client Notification Settings",
    });
    userId = user.id;
    token = generateToken({ id: user.id });
  });

  afterAll(async () => {
    try {
      if (userId) await deleteClient({ id: userId });
    } finally {
      await prismaClient.$disconnect();
    }
  });

  it("creates and updates the authenticated client's settings", async () => {
    const created = await request(app)
      .patch("/api/v1/client/notification-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: false, sms: true, push: false });

    expect(created.status).toBe(200);
    expect(created.body).toEqual(
      expect.objectContaining({ userId, email: false, sms: true, push: false }),
    );

    const updated = await request(app)
      .patch("/api/v1/client/notification-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ push: true });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(
      expect.objectContaining({ userId, email: false, sms: true, push: true }),
    );
    await expect(
      prismaClient.notificationSettings.findUnique({ where: { userId } }),
    ).resolves.toEqual(expect.objectContaining({ email: false, sms: true, push: true }));
  });
});
