import request from "supertest";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { createVerificationReport } from "../../../../../api/client/verification/services/database/verification-report";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `verification-report-summary-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let verificationReportId: string;
let serviceId: string;
let agentUserId: string;
let verificationAgentId: string;

describe("GET /api/v1/client/verification-requests/reports-summary (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Verification Report Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Report Verification ${testSuffix}`,
        slug: `report-verification-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Verification",
      slug: `report-verification-type-${testSuffix}`,
      icon: "building",
    });
    verificationTypeId = verificationType.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      status: "COMPLETED",
      details: { propertyName: "Ikoyi Residential Project" },
    });
    verificationRequestId = verificationRequest.id;

    const agentUser = await prismaClient.user.create({
      data: {
        fullName: "Verification Report Agent",
        email: `verification-report-agent-${testSuffix}@example.com`,
        role: "AGENT",
      },
    });
    agentUserId = agentUser.id;

    const verificationAgent = await prismaClient.verificationAgent.create({
      data: {
        userId: agentUserId,
        name: "Verification Report Agent",
      },
    });
    verificationAgentId = verificationAgent.id;

    const verificationReport = await createVerificationReport({
      verificationRequestId,
      submittedByAgentId: verificationAgentId,
      summary: "Report ready",
    });
    verificationReportId = verificationReport.id;
  });

  afterAll(async () => {
    await prismaClient.verificationReport.delete({
      where: { id: verificationReportId },
    });
    await prismaClient.verificationAgent.delete({
      where: { id: verificationAgentId },
    });
    await prismaClient.user.delete({ where: { id: agentUserId } });
    await prismaClient.verificationRequest.delete({
      where: { id: verificationRequestId },
    });
    await prismaClient.verificationType.delete({
      where: { id: verificationTypeId },
    });
    await prismaClient.service.delete({ where: { id: serviceId } });
    await deleteClient({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get("/api/v1/client/verification-requests/reports-summary");

    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's unviewed report count", async () => {
    const res = await request(app)
      .get("/api/v1/client/verification-requests/reports-summary")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unviewedReportsCount: 1 });
  });
});
