import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let agentUserId: string;
let agentId: string;
let clientId: string;
let serviceId: string;
let verificationTypeId: string;
let verificationRequestId: string;
let assignmentId: string;
let agentToken: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Start Verification Agent",
      email: `start-verification-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Start Verification Client",
      email: `start-verification-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;

  const service = await prismaClient.service.create({
    data: {
      name: `Start Verification Service ${suffix}`,
      slug: `start-verification-service-${suffix}`,
    },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Property Verification",
      slug: `start-verification-type-${suffix}`,
    },
  });
  verificationTypeId = verificationType.id;

  await prismaClient.checklistTemplateItem.createMany({
    data: [
      {
        verificationTypeId,
        label: "Property structure verified",
        requiresMedia: true,
        sortOrder: 0,
      },
      {
        verificationTypeId,
        label: "Property deed reviewed",
        requiresMedia: false,
        sortOrder: 1,
      },
    ],
  });

  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId,
      status: "IN_PROGRESS",
      details: { propertyAddress: "Lagos" },
    },
  });
  verificationRequestId = verificationRequest.id;

  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Start Verification Agent" },
  });
  agentId = agent.id;

  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId,
      agentId,
      status: "ASSIGNED",
    },
  });
  assignmentId = assignment.id;
});

afterAll(async () => {
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.verificationRequest.delete({ where: { id: verificationRequestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [agentUserId, clientId] } } });
  await prismaClient.$disconnect();
});

describe("POST /api/v1/admin/verification/agent-assignments/:id/start", () => {
  it("returns 401 without an authentication token", async () => {
    const response = await request(app).post(
      `/api/v1/admin/verification/agent-assignments/${assignmentId}/start`,
    );

    expect(response.status).toBe(401);
  });

  it("accepts the assignment and creates its checklist items", async () => {
    const response = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/start`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: assignmentId,
      status: "ACCEPTED",
      checklist: [
        {
          id: expect.any(String),
          label: "Property structure verified",
          status: "PENDING",
          requiresMedia: true,
        },
        {
          id: expect.any(String),
          label: "Property deed reviewed",
          status: "PENDING",
          requiresMedia: false,
        },
      ],
    });

    await expect(
      prismaClient.agentAssignment.findUnique({ where: { id: assignmentId } }),
    ).resolves.toEqual(expect.objectContaining({ status: "ACCEPTED" }));
    await expect(
      prismaClient.verificationChecklistItem.count({ where: { agentAssignmentId: assignmentId } }),
    ).resolves.toBe(2);
  });
});
