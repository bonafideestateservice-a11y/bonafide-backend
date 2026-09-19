import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminId: string;
let clientId: string;
let agentUserId: string;
let agentId: string;
let requestId: string;
let assignmentId: string;
let typeId: string;
let serviceId: string;
let agentToken: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Stats Admin",
      email: `stats-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  const client = await prismaClient.user.create({
    data: {
      fullName: "Stats Client",
      email: `stats-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Stats Agent",
      email: `stats-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });
  const service = await prismaClient.service.create({
    data: { name: `Stats Service ${suffix}`, slug: `stats-service-${suffix}` },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: { serviceId, name: "Property", slug: `stats-type-${suffix}` },
  });
  typeId = type.id;
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: { userId: clientId, verificationTypeId: typeId, details: {} },
  });
  requestId = verificationRequest.id;
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Stats Agent" },
  });
  agentId = agent.id;
  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestId,
      agentId,
      status: "ASSIGNED",
      progressPercent: 80,
    },
  });
  assignmentId = assignment.id;
});

afterAll(async () => {
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.verificationRequest.delete({ where: { id: requestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: typeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({
    where: { id: { in: [adminId, clientId, agentUserId] } },
  });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/verification/agents/stats", () => {
  it("returns statistics for the authenticated agent", async () => {
    const res = await request(app)
      .get("/api/v1/admin/verification/agents/stats")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        activeCount: 1,
        completedCount: 0,
        avgRating: 0,
      }),
    );
  });
});
