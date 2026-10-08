import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-get-user");
let adminToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (id: string) =>
  request(app).get(`/api/v1/admin/users/${id}`).set("Authorization", `Bearer ${adminToken}`);

describe("GET /api/v1/admin/users/:id", () => {
  it("returns the client's stats and recent activity", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const agent = await fx.createAgent("agent");
    const day = 24 * 60 * 60 * 1000;
    // Two paid requests (₦5,000 each); one has a report generated 3 days after assignment.
    const first = await fx.createPaidRequest(client.id);
    await fx.createPaidRequest(client.id);
    await prismaClient.transaction.update({
      where: { id: first.paymentId },
      data: { assignedAt: new Date(Date.now() - 3 * day) },
    });
    await prismaClient.verificationReport.create({
      data: {
        verificationRequestId: first.id,
        transactionId: first.paymentId,
        submittedByAgentId: agent.id,
        generatedAt: new Date(),
      },
    });
    await prismaClient.activityLog.create({
      data: {
        type: "VERIFICATION_REQUEST_CREATED",
        verificationRequestId: first.id,
        subjectName: "Ocean View Villa",
      },
    });

    const response = await get(client.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: client.id,
      name: client.fullName,
      status: "ACTIVE",
      stats: { paidRequests: 2, totalSpent: 10000, averageResponseDays: 3 },
      recentActivity: [
        {
          subjectName: "Ocean View Villa",
          verificationRequestId: first.id,
          verificationType: "Land Verification",
        },
      ],
    });
  });

  it("returns 404 for agents and unknown users", async () => {
    const agent = await fx.createAgent("other");
    expect((await get(agent.userId)).status).toBe(404);
    expect((await get("missing")).status).toBe(404);
  });
});
