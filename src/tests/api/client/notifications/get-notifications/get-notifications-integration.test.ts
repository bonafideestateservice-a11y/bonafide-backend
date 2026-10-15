import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-updates");
let client: Awaited<ReturnType<typeof fx.createUser>>;
let requestId: string;

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  const paid = await fx.createPaidRequest(client.id);
  requestId = paid.id;
  await prismaClient.verificationRequest.update({
    where: { id: requestId },
    data: { details: { propertyName: "Lekki Phase 1 Apartment" } },
  });
  const base = {
    userId: client.id,
    verificationRequestId: requestId,
    verificationTypeId: paid.verificationTypeId,
  };
  await prismaClient.notification.create({
    data: {
      ...base,
      type: "AGENT_ASSIGNED",
      title: "Agent assigned",
      meta: { channel: "in_app", agentName: "Sarah Johnson" },
      createdAt: new Date(Date.now() - 60_000),
    },
  });
  await prismaClient.notification.create({
    data: {
      ...base,
      type: "REPORT_UPLOADED",
      title: "Verification report uploaded",
      meta: { channel: "in_app", reportId: "rep-1" },
      read: true,
    },
  });
  // The email copy of a notification isn't an in-app update.
  await prismaClient.notification.create({
    data: { ...base, type: "AGENT_ASSIGNED", meta: { channel: "email" } },
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (query = "", token = client.token) =>
  request(app).get(`/api/v1/client/notifications${query}`).set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/client/notifications", () => {
  it("returns the client's in-app updates, newest first, worded for the screen", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body.unreadCount).toBe(1);
    expect(response.body.meta).toMatchObject({ page: 1, totalItems: 2 });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        type: "REPORT_UPLOADED",
        title: "Land Verification Complete",
        body: "Your land verification report for Lekki Phase 1 Apartment is ready",
        reportId: "rep-1",
        read: true,
      }),
      expect.objectContaining({
        type: "AGENT_ASSIGNED",
        title: "New Agent Assigned",
        body: "Sarah Johnson has been assigned to your Lekki Phase 1 Apartment verification",
        verificationRequestId: requestId,
        read: false,
      }),
    ]);
  });

  it("filters to unread updates", async () => {
    const response = await get("?unreadOnly=true");
    expect(response.body.data.map((u: { type: string }) => u.type)).toEqual(["AGENT_ASSIGNED"]);
  });

  it("shows nothing from other clients and returns 401 without a token", async () => {
    const other = await fx.createUser("CLIENT", "other");
    expect((await get("", other.token)).body.data).toEqual([]);
    expect((await request(app).get("/api/v1/client/notifications")).status).toBe(401);
  });
});
