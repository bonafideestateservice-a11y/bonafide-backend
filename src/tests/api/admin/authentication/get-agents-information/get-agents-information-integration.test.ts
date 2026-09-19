import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminUserId: string;
let clientUserId: string;
let agentUserId: string;
let verificationAgentId: string;
let assignmentId: string;
let requestId: string;
let typeId: string;
let serviceId: string;
let agentToken: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Agent Info Admin",
      email: `agent-info-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminUserId = admin.id;
  const client = await prismaClient.user.create({
    data: {
      fullName: "Agent Info Client",
      email: `agent-info-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientUserId = client.id;
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Agent Info User",
      email: `agent-info-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });
  const service = await prismaClient.service.create({
    data: {
      name: `Agent Info Service ${suffix}`,
      slug: `agent-info-service-${suffix}`,
    },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: { serviceId, name: "Property", slug: `agent-info-type-${suffix}` },
  });
  typeId = type.id;
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientUserId,
      verificationTypeId: typeId,
      details: { propertyAddress: "Lagos" },
    },
  });
  requestId = verificationRequest.id;
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Agent Info User", region: "Lagos" },
  });
  verificationAgentId = agent.id;
  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestId,
      agentId: verificationAgentId,
      progressPercent: 50,
    },
  });
  assignmentId = assignment.id;
});

afterAll(async () => {
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.verificationRequest.delete({ where: { id: requestId } });
  await prismaClient.verificationAgent.delete({
    where: { id: verificationAgentId },
  });
  await prismaClient.verificationType.delete({ where: { id: typeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({
    where: { id: { in: [adminUserId, clientUserId, agentUserId] } },
  });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/agents/me", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/admin/agents/me");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated agent identity", async () => {
    const res = await request(app)
      .get("/api/v1/admin/agents/me")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: verificationAgentId,
      firstName: "Agent",
      lastName: "Info User",
    });
  });
});
