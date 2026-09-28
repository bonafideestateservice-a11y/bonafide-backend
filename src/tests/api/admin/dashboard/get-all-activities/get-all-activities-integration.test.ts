import request from "supertest";

jest.mock("../../../../../libs/firebase/index", () => ({
  messaging: { send: jest.fn() },
}));
jest.mock("../../../../../libs/stripe", () => ({
  stripe: {},
}));

import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminId: string;
let clientId: string;
let adminToken: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Activities Admin",
      email: `activities-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  adminToken = generateToken({ id: admin.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Activities Client",
      email: `activities-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;

  await prismaClient.notification.createMany({
    data: [
      {
        userId: clientId,
        type: "VERIFICATION_REQUEST_CREATED",
        notificationStatus: "SENT",
        title: "Verification request created",
        body: "A verification request was created.",
        meta: { channel: "in_app", clientName: "Activities Client" },
        sentAt: new Date(),
      },
      {
        userId: clientId,
        type: "REPORT_UPLOADED",
        notificationStatus: "SENT",
        title: "Verification report uploaded",
        body: "A report was uploaded.",
        meta: { channel: "email", agentName: "Activities Agent" },
        sentAt: new Date(),
      },
      {
        userId: clientId,
        type: "AGENT_ASSIGNED",
        notificationStatus: "SENT",
        title: "Agent assigned",
        body: "An agent was assigned.",
        meta: { channel: "in_app", agentName: "Activities Agent" },
        sentAt: new Date(),
      },
      {
        userId: clientId,
        type: "INSPECTION_STARTED",
        notificationStatus: "PENDING",
        title: "Inspection started",
        body: "An inspection started.",
        meta: { channel: "in_app" },
      },
    ],
  });
});

afterAll(async () => {
  try {
    if (clientId) {
      await prismaClient.notification.deleteMany({ where: { userId: clientId } });
    }
  } finally {
    await prismaClient.user.deleteMany({ where: { id: { in: [adminId, clientId] } } });
    await prismaClient.$disconnect();
  }
});

describe("GET /api/v1/admin/dashboard/activities", () => {
  it("requires authentication and admin access", async () => {
    const unauthenticated = await request(app).get("/api/v1/admin/dashboard/activities");
    expect(unauthenticated.status).toBe(401);

    const clientToken = generateToken({ id: clientId });
    const nonAdmin = await request(app)
      .get("/api/v1/admin/dashboard/activities")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(nonAdmin.status).toBe(403);
  });

  it("returns only sent activities with client and agent metadata", async () => {
    const response = await request(app)
      .get("/api/v1/admin/dashboard/activities")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.activities).toHaveLength(3);
    expect(response.body.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "VERIFICATION_REQUEST_CREATED",
          channel: "in_app",
          clientName: "Activities Client",
        }),
        expect.objectContaining({
          type: "REPORT_UPLOADED",
          channel: "email",
          agentName: "Activities Agent",
        }),
        expect.objectContaining({
          type: "AGENT_ASSIGNED",
          channel: "in_app",
          agentName: "Activities Agent",
        }),
      ]),
    );
    expect(response.body.activities).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "INSPECTION_STARTED" })]),
    );
  });
});
