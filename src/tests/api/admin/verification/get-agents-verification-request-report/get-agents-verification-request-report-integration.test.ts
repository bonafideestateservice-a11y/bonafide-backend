import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let agentUserId: string;
let clientUserId: string;
let serviceId: string;
let typeId: string;
let agentId: string;
let requestId: string;
let reportId: string;
let token: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Agent Report Detail",
      email: `agent-report-detail-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  token = generateToken({ id: agentUserId });
  const client = await prismaClient.user.create({
    data: {
      fullName: "Client Detail",
      email: `client-report-detail-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientUserId = client.id;
  const service = await prismaClient.service.create({
    data: {
      name: `Report Detail Service ${suffix}`,
      slug: `report-detail-service-${suffix}`,
    },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Property Verification",
      slug: `report-detail-type-${suffix}`,
    },
  });
  typeId = type.id;
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientUserId,
      verificationTypeId: typeId,
      details: { propertyAddress: "Plot 45, Lagos" },
    },
  });
  requestId = verificationRequest.id;
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Agent Report Detail" },
  });
  agentId = agent.id;
  const report = await prismaClient.verificationReport.create({
    data: {
      verificationRequestId: requestId,
      submittedByAgentId: agentId,
      reviewStatus: "REVISION_REQUESTED",
      rating: 3.5,
      summary: "Needs revision",
      findings: { issue: "Missing photo" },
      reportUrl: "https://example.com/detail.pdf",
    },
  });
  reportId = report.id;
});

afterAll(async () => {
  await prismaClient.verificationReport.delete({ where: { id: reportId } });
  await prismaClient.verificationRequest.delete({ where: { id: requestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: typeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({
    where: { id: { in: [agentUserId, clientUserId] } },
  });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/verification/agents/verification-requests/:id/report", () => {
  it("returns the full report for the authenticated agent", async () => {
    const res = await request(app)
      .get(
        `/api/v1/admin/verification/agents/verification-requests/${requestId}/report`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: reportId,
        verificationRequestId: requestId,
        submittedByAgentId: agentId,
        reviewStatus: "REVISION_REQUESTED",
        rating: 3.5,
        summary: "Needs revision",
        reportUrl: "https://example.com/detail.pdf",
      }),
    );
  });
});
