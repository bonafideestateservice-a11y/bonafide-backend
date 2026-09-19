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
let completeItemId: string;
let pendingItemId: string;
let reportId: string;
let agentToken: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Report Workflow Agent",
      email: `report-workflow-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Report Workflow Client User",
      email: `report-workflow-client-${suffix}@example.com`,
      phone: "08000000000",
      role: "CLIENT",
    },
  });
  clientId = client.id;

  const service = await prismaClient.service.create({
    data: { name: `Report Workflow Service ${suffix}`, slug: `report-workflow-service-${suffix}` },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Property Verification",
      slug: `report-workflow-type-${suffix}`,
    },
  });
  verificationTypeId = verificationType.id;

  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId,
      status: "IN_PROGRESS",
      details: { propertyAddress: "Plot 45, Lagos" },
    },
  });
  verificationRequestId = verificationRequest.id;

  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Report Workflow Agent" },
  });
  agentId = agent.id;

  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId,
      agentId,
      status: "ACCEPTED",
      additionalNotes: "Inspection completed.",
    },
  });
  assignmentId = assignment.id;

  const completeItem = await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Front View",
      status: "COMPLETE",
      sortOrder: 0,
    },
  });
  completeItemId = completeItem.id;
  const pendingItem = await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Main Bedroom",
      status: "PENDING",
      sortOrder: 1,
    },
  });
  pendingItemId = pendingItem.id;

  await prismaClient.document.create({
    data: {
      verificationRequestId,
      checklistItemId: completeItemId,
      url: "https://cdn.test/front.jpg",
      fileName: "front.jpg",
      fileType: "image/jpeg",
      fileSizeBytes: 1000,
    },
  });
});

afterAll(async () => {
  await prismaClient.document.deleteMany({ where: { verificationRequestId } });
  if (reportId) await prismaClient.verificationReport.delete({ where: { id: reportId } });
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.verificationRequest.delete({ where: { id: verificationRequestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [agentUserId, clientId] } } });
  await prismaClient.$disconnect();
});

describe("Agent assignment report workflow", () => {
  it("returns incomplete checklist details", async () => {
    const response = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "INCOMPLETE_CHECKLIST",
      progressPercent: 50,
      remainingItems: ["Main Bedroom"],
    });
  });

  it("submits the report and completes the assignment", async () => {
    await prismaClient.verificationChecklistItem.update({
      where: { id: pendingItemId },
      data: { status: "COMPLETE" },
    });

    const response = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      reviewStatus: "PENDING",
      generatedAt: expect.any(String),
    });
    reportId = response.body.id;

    await expect(
      prismaClient.agentAssignment.findUnique({ where: { id: assignmentId } }),
    ).resolves.toEqual(expect.objectContaining({ status: "INSPECTION_COMPLETE" }));
  });

  it("returns the read-only report with labeled photos", async () => {
    const response = await request(app)
      .get(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      client: {
        firstName: "Report",
        lastName: "Workflow Client User",
        phone: "08000000000",
        email: `report-workflow-client-${suffix}@example.com`,
      },
      address: "Plot 45, Lagos",
      photos: [{ url: "https://cdn.test/front.jpg", label: "Front View" }],
      additionalNotes: "Inspection completed.",
      reportUrl: null,
    });
  });
});
