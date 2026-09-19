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
let reportId: string;
let agentToken: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Checklist Agent",
      email: `checklist-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Checklist Client User",
      email: `checklist-client-${suffix}@example.com`,
      phone: "08000000000",
      role: "CLIENT",
    },
  });
  clientId = client.id;

  const service = await prismaClient.service.create({
    data: { name: `Checklist Service ${suffix}`, slug: `checklist-service-${suffix}` },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Property Verification",
      slug: `checklist-type-${suffix}`,
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
    data: { userId: agentUserId, name: "Checklist Agent" },
  });
  agentId = agent.id;

  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId,
      agentId,
      status: "ACCEPTED",
      additionalNotes: "Call before arrival.",
    },
  });
  assignmentId = assignment.id;

  const completeItem = await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Front view verified",
      status: "COMPLETE",
      sortOrder: 0,
    },
  });
  checklistItemId = completeItem.id;
  await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Bedroom verified",
      status: "PENDING",
      sortOrder: 1,
    },
  });

  await prismaClient.document.create({
    data: {
      verificationRequestId,
      checklistItemId,
      url: "https://example.com/front.jpg",
      fileName: "Front View.jpg",
      fileType: "image/jpeg",
      fileSizeBytes: 1200,
    },
  });
  await prismaClient.document.create({
    data: {
      verificationRequestId,
      url: "https://example.com/deed.pdf",
      fileName: "Property Deed.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 3800000,
    },
  });

  const report = await prismaClient.verificationReport.create({
    data: {
      verificationRequestId,
      submittedByAgentId: agentId,
      summary: "Existing report",
    },
  });
  reportId = report.id;
});

afterAll(async () => {
  await prismaClient.document.deleteMany({ where: { verificationRequestId } });
  await prismaClient.verificationReport.delete({ where: { id: reportId } });
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.verificationRequest.delete({ where: { id: verificationRequestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [agentUserId, clientId] } } });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/verification/agent-assignments/:id/checklist", () => {
  it("returns the checklist and separates agent media from client documents", async () => {
    const response = await request(app)
      .get(`/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      checklistItems: [
        {
          id: checklistItemId,
          label: "Front view verified",
          status: "COMPLETE",
          media: [{ url: "https://example.com/front.jpg" }],
        },
        {
          id: expect.any(String),
          label: "Bedroom verified",
          status: "PENDING",
          media: [],
        },
      ],
      clientDocuments: [
        {
          id: expect.any(String),
          fileName: "Property Deed.pdf",
          fileSizeBytes: 3800000,
          url: "https://example.com/deed.pdf",
        },
      ],
      client: {
        firstName: "Checklist",
        lastName: "Client User",
        phone: "08000000000",
        email: `checklist-client-${suffix}@example.com`,
      },
      additionalNotes: "Call before arrival.",
      progressPercent: 50,
      payment: { status: "PENDING", amountInCents: 0 },
    });
  });
});
