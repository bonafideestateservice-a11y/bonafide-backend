import express from "express";
import request from "supertest";
import { ROLE } from "@prisma/client";
import adminAuthenticationRoutes from "../../../../../api/admin/authentication";
import {
  createAdmin,
  deleteAdmin,
} from "../../../../../api/admin/authentication/services/database/admin";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const app = express();
app.use(express.json());
app.use("/api/v1/admin", adminAuthenticationRoutes);

const suffix = Date.now();
let userId: string;
let token: string;

describe("Admin notification settings endpoint (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createAdmin({
      role: ROLE.ADMIN,
      email: `admin-notification-settings-${suffix}@example.com`,
      fullName: "Admin Notification Settings",
    });
    userId = user.id;
    token = generateToken({ id: user.id });
  });

  afterAll(async () => {
    try {
      if (userId) await deleteAdmin({ id: userId });
    } finally {
      await prismaClient.$disconnect();
    }
  });

  it("creates and updates the authenticated admin's settings", async () => {
    const created = await request(app)
      .patch("/api/v1/admin/notification-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: true, sms: false, push: true });

    expect(created.status).toBe(200);
    expect(created.body).toEqual(
      expect.objectContaining({ userId, email: true, sms: false, push: true }),
    );

    const updated = await request(app)
      .patch("/api/v1/admin/notification-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ sms: true });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(
      expect.objectContaining({ userId, email: true, sms: true, push: true }),
    );
    await expect(
      prismaClient.notificationSettings.findUnique({ where: { userId } }),
    ).resolves.toEqual(expect.objectContaining({ email: true, sms: true, push: true }));
  });
});
