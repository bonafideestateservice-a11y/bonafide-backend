import request from "supertest";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { createVerificationPlan } from "../../../../../api/client/verification/services/database/verification-plan";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `get-full-report-${testSuffix}@example.com`;
const agentEmail = `agent-full-${testSuffix}@example.com`;
let testUserId: string;
let verificationTypeId: string;
let verificationPlanId: string;
let verificationRequestId: string;
let serviceId: string;
let agentUserId: string;
let verificationReportId: string;

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}/report/full`;

describe("GET /api/v1/client/verification-requests/:id/report/full (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Full Report Test User",
    });
    testUserId = user.id;

    const service = await prismaClient.service.create({
      data: {
        name: `Full Report Service ${testSuffix}`,
        slug: `full-report-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `full-report-property-verification-${testSuffix}`,
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
        propertyAddress: "123 Full Report Ave",
        propertyType: "Residential",
        plotSize: "1000sqm",
        builtYear: "2015"
      },
    });
    verificationRequestId = verificationRequest.id;

    // Create an agent user and agent profile
    const agentUser = await prismaClient.user.create({
      data: {
        email: agentEmail,
        fullName: "Agent Full",
        role: "AGENT",
      }
    });
    agentUserId = agentUser.id;

    const agent = await prismaClient.verificationAgent.create({
      data: {
        userId: agentUserId,
        name: "Agent Full",
      }
    });

    // Create AgentAssignment
    const assignment = await prismaClient.agentAssignment.create({
      data: {
        verificationRequestId,
        agentId: agent.id,
        status: "REPORT_SUBMITTED",
        completedAt: new Date(),
        progressPercent: 100,
        additionalNotes: "The property is in great shape."
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
            url: "http://example.com/door-full.png",
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
        summary: "Executive summary details here.",
        findings: [
          { label: "Ownership", value: "Verified and Clean", status: "good" }
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

  it("returns 200 without authentication (public endpoint)", async () => {
    const res = await request(app).get(endpoint());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });

  it("returns 404 for a non-existent request id", async () => {
    const res = await request(app).get(`/api/v1/client/verification-requests/req-99999/report/full`);
    expect(res.status).toBe(404);
  });

  it("returns full report details from DB correctly", async () => {
    const res = await request(app).get(endpoint());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.id).toBe(verificationRequestId);
    expect(res.body.data.reportId).toBe(verificationReportId);
    expect(res.body.data.property.name).toBe("Test Property");
    expect(res.body.data.property.address).toBe("123 Full Report Ave");
    expect(res.body.data.property.type).toBe("Residential");
    expect(res.body.data.property.plotSize).toBe("1000sqm");
    expect(res.body.data.property.builtYear).toBe("2015");
    expect(res.body.data.agent.firstName).toBe("Agent");
    expect(res.body.data.agent.lastName).toBe("Full");
    expect(res.body.data.agentNotes).toBe("The property is in great shape.");
    expect(res.body.data.summary).toBe("Executive summary details here.");
    expect(res.body.data.ownershipFindings).toBe("Verified and Clean");
    expect(res.body.data.findings).toHaveLength(1);
    expect(res.body.data.findings[0].label).toBe("Ownership");
    expect(res.body.data.findings[0].value).toBe("Verified and Clean");
    expect(res.body.data.findings[0].status).toBe("good");
    expect(res.body.data.photos).toHaveLength(1);
    expect(res.body.data.photos[0].url).toBe("http://example.com/door-full.png");
    expect(res.body.data.photos[0].label).toBe("Front Door");
  });
});
