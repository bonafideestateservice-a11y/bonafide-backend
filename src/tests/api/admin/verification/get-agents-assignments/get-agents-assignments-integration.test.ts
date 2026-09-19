import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let agentToken: string;
let adminId: string;
let clientId: string;
let agentUserId: string;
let agentId: string;
let requestId: string;
let assignmentId: string;
let typeId: string;
let serviceId: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Assignments Admin",
      email: `assignments-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  const client = await prismaClient.user.create({
    data: {
      fullName: "Assignment Client",
      email: `assignments-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Assignment Agent",
      email: `assignments-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });
  const service = await prismaClient.service.create({
    data: {
      name: `Assignments Service ${suffix}`,
      slug: `assignments-service-${suffix}`,
    },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: { serviceId, name: "Property", slug: `assignments-type-${suffix}` },
  });
  typeId = type.id;
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId: typeId,
      status: "IN_PROGRESS",
      details: { propertyAddress: "Lagos" },
    },
  });
  requestId = verificationRequest.id;
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Assignment Agent", region: "Lagos" },
  });
  agentId = agent.id;
  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestId,
      agentId,
      status: "INSPECTION_SCHEDULED",
      progressPercent: 60,
      additionalNotes: "Bring camera.",
    },
  });
  assignmentId = assignment.id;
  await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Property structure verified",
      sortOrder: 0,
    },
  });
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

describe("GET /api/v1/admin/verification/agents/assignments", () => {
  it("returns assignment cards for the authenticated agent", async () => {
    const res = await request(app)
      .get("/api/v1/admin/verification/agents/assignments?limit=5")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: assignmentId,
          status: "INSPECTION_SCHEDULED",
          verificationType: { name: "Property" },
          client: { firstName: "Assignment", lastName: "Client" },
          address: "Lagos",
          progressPercent: 60,
          scheduledAt: null,
        }),
      ]),
    );
  });
});
