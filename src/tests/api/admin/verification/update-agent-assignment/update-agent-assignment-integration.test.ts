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
      fullName: "Update Assignment Agent",
      email: `update-assignment-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });
  const client = await prismaClient.user.create({
    data: {
      fullName: "Update Assignment Client",
      email: `update-assignment-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;
  const service = await prismaClient.service.create({
    data: { name: `Update Service ${suffix}`, slug: `update-service-${suffix}` },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: { serviceId, name: "Property", slug: `update-type-${suffix}` },
  });
  verificationTypeId = type.id;
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
    data: { userId: agentUserId, name: "Update Assignment Agent" },
  });
  agentId = agent.id;
  const assignment = await prismaClient.agentAssignment.create({
    data: { verificationRequestId, agentId, status: "ACCEPTED" },
  });
  assignmentId = assignment.id;
  const checklistItem = await prismaClient.verificationChecklistItem.create({
    data: { agentAssignmentId: assignmentId, label: "Front view", sortOrder: 0 },
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

describe("Agent assignment update endpoints", () => {
  it("updates checklist status through JSON", async () => {
    const response = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${checklistItemId}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ status: "COMPLETE" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: checklistItemId,
      label: "Front view",
      status: "COMPLETE",
      media: [],
    });
  });

  it("updates assignment notes", async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/verification/agent-assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ additionalNotes: "Call before arrival." });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: assignmentId,
      additionalNotes: "Call before arrival.",
    });
    await expect(
      prismaClient.agentAssignment.findUnique({ where: { id: assignmentId } }),
    ).resolves.toEqual(expect.objectContaining({ additionalNotes: "Call before arrival." }));
  });
});
