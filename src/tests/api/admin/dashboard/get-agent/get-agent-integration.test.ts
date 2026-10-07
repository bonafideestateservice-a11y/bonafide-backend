import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-get-agent");
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (id: string, token = adminToken) =>
  request(app).get(`/api/v1/admin/agents/${id}`).set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/agents/:id", () => {
  it("returns the agent's assigned properties, open jobs and report stats", async () => {
    const client = await fx.createUser("CLIENT", "owner");
    const agent = await fx.createAgent("agent");
    await fx.giveOpenJobs(agent.id, client.id, 2);
    const property = await fx.createProperty({ agent: { connect: { id: agent.id } } });
    await fx.createProperty({ agent: { connect: { id: agent.id } }, deletedAt: new Date() });
    // Two reviewed reports: one approved, one sent back.
    for (const reviewStatus of ["APPROVED", "REVISION_REQUESTED"] as const) {
      const done = await fx.createPaidRequest(client.id, "COMPLETED");
      await prismaClient.verificationReport.create({
        data: {
          verificationRequestId: done.id,
          transactionId: done.paymentId,
          submittedByAgentId: agent.id,
          generatedAt: new Date(),
          reviewStatus,
        },
      });
    }

    const response = await get(agent.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: agent.id,
      userId: agent.userId,
      name: agent.name,
      displayStatus: "AVAILABLE",
      // The badge counts assigned properties, not verification jobs.
      assignedPropertyCount: 1,
      maxAssignedProperties: 5,
      stats: { totalVerifications: 2, successRate: 50, averageResponseDays: null },
    });
    // Deleted properties are left out.
    expect(response.body.assignedProperties).toEqual([
      expect.objectContaining({ id: property.id, title: property.name }),
    ]);
  });

  it("returns 404 for unknown agents and 403 for non-admins", async () => {
    expect((await get("missing")).status).toBe(404);
    expect((await get("missing", clientToken)).status).toBe(403);
  });
});
