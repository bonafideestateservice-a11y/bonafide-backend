import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn().mockResolvedValue({
        public_id: "integration-report-document",
        secure_url: "https://cdn.test/agent-report.pdf",
      }),
      destroy: jest.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

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
const otherItemIds: string[] = [];
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
      label: "Physical verification",
      status: "COMPLETE",
      sortOrder: 0,
    },
  });
  completeItemId = completeItem.id;
  const pendingItem = await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Court/crime verification",
      status: "PENDING",
      sortOrder: 1,
    },
  });
  pendingItemId = pendingItem.id;
  for (const [sortOrder, label] of [
    [2, "Title deeds and documentation verification"],
    [3, "Valuation verification"],
    [4, "Amenities and environment verification"],
  ] as const) {
    const item = await prismaClient.verificationChecklistItem.create({
      data: {
        agentAssignmentId: assignmentId,
        label,
        status: "COMPLETE",
        sortOrder,
      },
    });
    otherItemIds.push(item.id);
  }

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
  if (verificationRequestId) {
    await prismaClient.document.deleteMany({ where: { verificationRequestId } });
    const checklistIds = [completeItemId, pendingItemId, ...otherItemIds].filter(
      (id): id is string => Boolean(id),
    );
    if (checklistIds.length > 0) {
      await prismaClient.verificationChecklistItem.deleteMany({
        where: { id: { in: checklistIds } },
      });
    }
    if (reportId) await prismaClient.verificationReport.delete({ where: { id: reportId } });
    if (assignmentId) await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
    await prismaClient.transaction.deleteMany({ where: { verificationRequestId } });
    await prismaClient.verificationRequest.deleteMany({ where: { id: verificationRequestId } });
  }
  if (agentId) await prismaClient.verificationAgent.deleteMany({ where: { id: agentId } });
  if (verificationTypeId) {
    await prismaClient.verificationType.deleteMany({ where: { id: verificationTypeId } });
  }
  if (serviceId) await prismaClient.service.deleteMany({ where: { id: serviceId } });
  const userIds = [agentUserId, clientId].filter((id): id is string => Boolean(id));
  if (userIds.length > 0) {
    await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prismaClient.$disconnect();
});

describe("Agent assignment report workflow", () => {
  it("returns incomplete checklist details", async () => {
    const response = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .attach("report_document", Buffer.from("%PDF-1.4 test report"), {
        filename: "agent-report.pdf",
        contentType: "application/pdf",
      })
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "INCOMPLETE_CHECKLIST",
      progressPercent: 80,
      remainingItems: ["Court/crime verification"],
    });
  });

  it("submits the report and completes the one-time request", async () => {
    await prismaClient.verificationChecklistItem.update({
      where: { id: pendingItemId },
      data: { status: "COMPLETE" },
    });

    const response = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .attach("report_document", Buffer.from("%PDF-1.4 test report"), {
        filename: "agent-report.pdf",
        contentType: "application/pdf",
      })
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      reviewStatus: "APPROVED",
      generatedAt: expect.any(String),
      reportDocument: {
        id: expect.any(String),
        url: "https://cdn.test/agent-report.pdf",
        fileName: "agent-report.pdf",
        fileType: "application/pdf",
        fileSizeBytes: 20,
      },
    });
    reportId = response.body.id;

    await expect(
      prismaClient.agentAssignment.findUnique({ where: { id: assignmentId } }),
    ).resolves.toEqual(expect.objectContaining({ status: "REPORT_SUBMITTED" }));
    await expect(
      prismaClient.verificationRequest.findUnique({ where: { id: verificationRequestId } }),
    ).resolves.toEqual(expect.objectContaining({ status: "COMPLETED" }));

    // The report keeps the agent's notes and checklist.
    const report = await prismaClient.verificationReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { checklistItems: { select: { id: true } } },
    });
    expect(report.additionalNotes).toBe("Inspection completed.");
    expect(report.submittedByAgentId).toBe(agentId);
    expect(report.checklistItems.map((item) => item.id).sort()).toEqual(
      [completeItemId, pendingItemId, ...otherItemIds].sort(),
    );
    await expect(
      prismaClient.document.findFirst({
        where: { verificationReportId: reportId, documentType: "REPORT_DOCUMENT" },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        url: "https://cdn.test/agent-report.pdf",
        fileName: "agent-report.pdf",
      }),
    );
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
      photos: [{ url: "https://cdn.test/front.jpg", label: "Physical verification" }],
      checklist: [
        { label: "Physical verification", status: "COMPLETE" },
        { label: "Court/crime verification", status: "COMPLETE" },
        { label: "Title deeds and documentation verification", status: null },
        { label: "Valuation verification", status: null },
        { label: "Amenities and environment verification", status: null },
      ],
      additionalNotes: "Inspection completed.",
      reportUrl: "https://cdn.test/agent-report.pdf",
      reportDocument: {
        id: expect.any(String),
        url: "https://cdn.test/agent-report.pdf",
        fileName: "agent-report.pdf",
        fileType: "application/pdf",
        fileSizeBytes: 20,
      },
    });
  });
});
