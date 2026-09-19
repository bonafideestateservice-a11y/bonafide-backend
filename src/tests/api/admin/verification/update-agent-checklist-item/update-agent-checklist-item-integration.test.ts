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
let checklistItemId: string;
let agentToken: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Checklist Update Agent",
      email: `checklist-update-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Checklist Update Client",
      email: `checklist-update-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;

  const service = await prismaClient.service.create({
    data: {
      name: `Checklist Update Service ${suffix}`,
      slug: `checklist-update-service-${suffix}`,
    },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Property Verification",
      slug: `checklist-update-type-${suffix}`,
    },
  });
  verificationTypeId = verificationType.id;

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
    data: { userId: agentUserId, name: "Checklist Update Agent" },
  });
  agentId = agent.id;

  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId,
      agentId,
      status: "ACCEPTED",
    },
  });
  assignmentId = assignment.id;

  const checklistItem = await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Property structure verified",
      status: "PENDING",
      sortOrder: 0,
    },
  });
  checklistItemId = checklistItem.id;
});

afterAll(async () => {
  await prismaClient.document.deleteMany({ where: { verificationRequestId } });
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.verificationRequest.delete({ where: { id: verificationRequestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [agentUserId, clientId] } } });
  await prismaClient.$disconnect();
});

describe("PATCH /api/v1/admin/verification/agent-assignments/:id/checklist/:itemId", () => {
  it("updates the checklist item status and persists it", async () => {
    const response = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${checklistItemId}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ status: "COMPLETE" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: checklistItemId,
      label: "Property structure verified",
      status: "COMPLETE",
      media: [],
    });

    await expect(
      prismaClient.verificationChecklistItem.findUnique({ where: { id: checklistItemId } }),
    ).resolves.toEqual(expect.objectContaining({ status: "COMPLETE" }));
  });
});
