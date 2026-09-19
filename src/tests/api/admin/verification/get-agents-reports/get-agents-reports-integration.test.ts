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
      fullName: "Agent Reports User",
      email: `agent-reports-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  token = generateToken({ id: agentUserId });
  const client = await prismaClient.user.create({
    data: {
      fullName: "Client Williams",
      email: `client-reports-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientUserId = client.id;
  const service = await prismaClient.service.create({
    data: {
      name: `Reports Service ${suffix}`,
      slug: `reports-service-${suffix}`,
    },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Business Verification",
      slug: `reports-type-${suffix}`,
    },
  });
  typeId = type.id;
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientUserId,
      verificationTypeId: typeId,
      details: { businessAddress: "Garki District, Abuja" },
    },
  });
  requestId = verificationRequest.id;
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Agent Reports User" },
  });
  agentId = agent.id;
  const report = await prismaClient.verificationReport.create({
    data: {
      verificationRequestId: requestId,
      submittedByAgentId: agentId,
      reviewStatus: "APPROVED",
      rating: 4,
      reportUrl: "https://example.com/report.pdf",
      generatedAt: new Date("2026-01-24T16:00:00.000Z"),
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

describe("GET /api/v1/admin/verification/agents/reports", () => {
  it("returns filtered report cards for the authenticated agent", async () => {
    const res = await request(app)
      .get("/api/v1/admin/verification/agents/reports?reviewStatus=APPROVED&search=Garki")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: reportId,
        verificationType: { name: "Business Verification" },
        client: { firstName: "Client", lastName: "Williams" },
        district: "Garki District, Abuja",
        generatedAt: "2026-01-24T16:00:00.000Z",
        reviewStatus: "APPROVED",
        rating: 4,
        reportUrl: "https://example.com/report.pdf",
      },
    ]);
  });
});
