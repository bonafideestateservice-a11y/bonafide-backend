import request from "supertest";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `get-tracking-${testSuffix}@example.com`;
const agentEmail = `agent-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let serviceId: string;
let agentUserId: string;

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}/tracking`;

describe("GET /api/v1/client/verification-requests/:id/tracking (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Tracking Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Tracking Service ${testSuffix}`,
        slug: `tracking-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `tracking-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      status: "DRAFT",
      details: {
        propertyAddress: "123 Tracking Ave",
      },
      notifyOnInspectionStart: true,
      notifyOnReportReady: true
    } as any); // Type cast due to added fields
    verificationRequestId = verificationRequest.id;

    // Create an agent user and agent profile
    const agentUser = await prismaClient.user.create({
      data: {
        email: agentEmail,
        fullName: "Agent Smith",
        role: "AGENT",
        profilePhoto: "http://example.com/agent-smith.png"
      }
    });
    agentUserId = agentUser.id;

    const agent = await prismaClient.verificationAgent.create({
      data: {
        userId: agentUserId,
        name: "Agent Smith",
      }
    });

    // Create AgentAssignment
    const assignment = await prismaClient.agentAssignment.create({
      data: {
        verificationRequestId,
        agentId: agent.id,
        status: "INSPECTION_SCHEDULED",
        scheduledAt: new Date(),
        progressPercent: 50
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
            url: "http://example.com/door.png",
            fileName: "door.png",
            fileType: "image/png",
            fileSizeBytes: 1024
          }
        }
      }
    });

  });

  afterAll(async () => {
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
    await prismaClient.verificationType.delete({
      where: { id: verificationTypeId },
    });
    await prismaClient.service.delete({ where: { id: serviceId } });
    await deleteClient({ id: testUserId });
    
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

  it("returns 404 for a non-existent tracking id", async () => {
    const res = await request(app).get(`/api/v1/client/verification-requests/req-99999/tracking`).set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  it("returns tracking details from DB correctly", async () => {
    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.id).toBe(verificationRequestId);
    expect(res.body.data.address).toBe("123 Tracking Ave");
    expect(res.body.data.verificationType.name).toBe("Property Verification");
    expect(res.body.data.agent.firstName).toBe("Agent");
    expect(res.body.data.agent.lastName).toBe("Smith");
    expect(res.body.data.agent.isVerified).toBe(true);
    expect(res.body.data.agent.photoUrl).toBe("http://example.com/agent-smith.png");
    expect(res.body.data.inspectionUploads).toHaveLength(1);
    expect(res.body.data.inspectionUploads[0].url).toBe("http://example.com/door.png");
    expect(res.body.data.progressPercent).toBe(100); // 1 item, which is COMPLETE
    expect(res.body.data.notificationPreferences.notifyOnInspectionStart).toBe(true);
  });
});
