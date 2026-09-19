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
let assignmentId: string;
let transactionId: string;
let token: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: { fullName: "Detail Agent", email: `detail-agent-${suffix}@example.com`, role: "AGENT" },
  });
  agentUserId = agentUser.id;
  token = generateToken({ id: agentUserId });
  const client = await prismaClient.user.create({
    data: {
      fullName: "Client David",
      phone: "08012345678",
      email: `detail-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientUserId = client.id;
  const service = await prismaClient.service.create({
    data: { name: `Detail Service ${suffix}`, slug: `detail-service-${suffix}` },
  });
  serviceId = service.id;
  const type = await prismaClient.verificationType.create({
    data: { serviceId, name: "Property Verification", slug: `detail-type-${suffix}` },
  });
  typeId = type.id;
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientUserId,
      verificationTypeId: typeId,
      details: { propertyAddress: "Plot 45, Lekki Phase 1, Lagos" },
    },
  });
  requestId = verificationRequest.id;
  const transaction = await prismaClient.transaction.create({
    data: {
      verificationRequestId: requestId,
      amountInCents: 3500000,
      currency: "NGN",
      method: "CARD",
      status: "SUCCESS",
    },
  });
  transactionId = transaction.id;
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Detail Agent" },
  });
  agentId = agent.id;
  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestId,
      agentId,
      status: "ASSIGNED",
      scheduledAt: new Date("2026-01-24T16:00:00.000Z"),
    },
  });
  assignmentId = assignment.id;
});

afterAll(async () => {
  await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
  await prismaClient.transaction.delete({ where: { id: transactionId } });
  await prismaClient.verificationRequest.delete({ where: { id: requestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: typeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [agentUserId, clientUserId] } } });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/verification/agents/assignments/:id", () => {
  it("returns assignment details for the assigned agent", async () => {
    const res = await request(app)
      .get(`/api/v1/admin/verification/agents/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: assignmentId,
      status: "ASSIGNED",
      verificationType: { name: "Property Verification" },
      address: "Plot 45, Lekki Phase 1, Lagos",
      client: {
        firstName: "Client",
        lastName: "David",
        phone: "08012345678",
        email: expect.any(String),
      },
      payment: { status: "SUCCESS", amountInCents: 3500000, currency: "NGN" },
      scheduledAt: "2026-01-24T16:00:00.000Z",
    });
  });
});
