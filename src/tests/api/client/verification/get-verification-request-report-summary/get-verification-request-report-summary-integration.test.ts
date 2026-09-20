import request from "supertest";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { createVerificationPlan } from "../../../../../api/client/verification/services/database/verification-plan";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `get-report-summary-${testSuffix}@example.com`;
const agentEmail = `agent-summary-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationPlanId: string;
let verificationRequestId: string;
let serviceId: string;
let agentUserId: string;
let verificationReportId: string;

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}/report-summary`;

describe("GET /api/v1/client/verification-requests/:id/report-summary (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Report Summary Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Summary Service ${testSuffix}`,
        slug: `summary-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `summary-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    const verificationPlan = await createVerificationPlan({
      verificationTypeId,
      frequency: "ONE_TIME",
      name: "Gold Plan",
      description: "A single inspection with a full report",
      priceInCents: 4500,
      currency: "USD",
    });
    verificationPlanId = verificationPlan.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      verificationPlanId,
      status: "COMPLETED",
      details: {
        propertyName: "Test Property",
        propertyAddress: "123 Summary Ave",
      },
    });
    verificationRequestId = verificationRequest.id;

    // Create an agent user and agent profile
    const agentUser = await prismaClient.user.create({
      data: {
        email: agentEmail,
        fullName: "Agent Summary",
        role: "AGENT",
      }
    });
    agentUserId = agentUser.id;

    const agent = await prismaClient.verificationAgent.create({
      data: {
        userId: agentUserId,
        name: "Agent Summary",
      }
    });

    // Create AgentAssignment
    const assignment = await prismaClient.agentAssignment.create({
      data: {
        verificationRequestId,
        agentId: agent.id,
        status: "REPORT_SUBMITTED",
        completedAt: new Date(),
        progressPercent: 100
      }
    });

    // Create ChecklistItems
    await prismaClient.verificationChecklistItem.create({
      data: {
        agentAssignmentId: assignment.id,
        label: "Front Door",
        status: "COMPLETE",
        sortOrder: 1,
        media: {
          create: {
            verificationRequestId,
            url: "http://example.com/door-summary.png",
            fileName: "door.png",
            fileType: "image/png",
            fileSizeBytes: 1024
          }
        }
      }
    });

    // Create VerificationReport
    const report = await prismaClient.verificationReport.create({
      data: {
        verificationRequestId,
        submittedByAgentId: agent.id,
        generatedAt: new Date(),
        findings: [
          { label: "Ownership Status", value: "Verified", status: "good" }
        ],
        reviewStatus: "APPROVED"
      }
    });
    verificationReportId = report.id;

  });

  afterAll(async () => {
    if (verificationReportId) {
      await prismaClient.verificationReport.delete({
        where: { id: verificationReportId }
      });
    }
    // Delete documents first
    await prismaClient.document.deleteMany({
      where: { verificationRequestId }
    });
    // Delete checklist items
    await prismaClient.verificationChecklistItem.deleteMany({
      where: { agentAssignment: { verificationRequestId } }
    });
    // Delete assignments
    await prismaClient.agentAssignment.deleteMany({
      where: { verificationRequestId }
    });
    if (verificationRequestId) {
      await prismaClient.verificationRequest.delete({
        where: { id: verificationRequestId },
      });
    }
    if (verificationPlanId) {
      await prismaClient.verificationPlan.delete({
        where: { id: verificationPlanId },
      });
    }
    if (verificationTypeId) {
      await prismaClient.verificationType.delete({
        where: { id: verificationTypeId },
      });
    }
    if (serviceId) {
      await prismaClient.service.delete({ where: { id: serviceId } });
    }
    if (testUserId) {
      await deleteClient({ id: testUserId });
    }
    
    // Clean up agent
    if (agentUserId) {
      await prismaClient.verificationAgent.deleteMany({
        where: { userId: agentUserId }
      });
      await prismaClient.user.delete({ where: { id: agentUserId }});
    }
    
    await prismaClient.$disconnect();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).get(endpoint());
    expect(res.status).toBe(401);
  });

  it("returns 404 for a non-existent request id", async () => {
    const res = await request(app).get(`/api/v1/client/verification-requests/req-99999/report-summary`).set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  it("returns report summary details from DB correctly", async () => {
    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.property).toBe("Test Property");
    expect(res.body.data.location).toBe("123 Summary Ave");
    expect(res.body.data.reportType).toBe("Gold Plan");
    expect(res.body.data.agent.firstName).toBe("Agent");
    expect(res.body.data.agent.lastName).toBe("Summary");
    expect(res.body.data.inspectionDate).toBeTruthy();
    expect(res.body.data.mediaPreview).toHaveLength(1);
    expect(res.body.data.mediaPreview[0].url).toBe("http://example.com/door-summary.png");
    expect(res.body.data.insights).toHaveLength(1);
    expect(res.body.data.insights[0].label).toBe("Ownership Status");
    expect(res.body.data.insights[0].status).toBe("good");
  });
});
