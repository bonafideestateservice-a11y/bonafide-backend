import request from "supertest";

jest.mock("@paystack/paystack-sdk", () => ({
  Paystack: class {},
}));

import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminId: string;
let clientId: string;
let agentUserId: string;
let agentId: string;
let requestId: string;
let typeId: string;
let serviceId: string;
let propertyId: string;
let adminToken: string;
let baselineClients: number;
let baselinePending: number;
let baselineActiveAgents: number;
let baselineVerifiedProperties: number;

beforeAll(async () => {
  [baselineClients, baselinePending, baselineActiveAgents, baselineVerifiedProperties] =
    await Promise.all([
      prismaClient.user.count({ where: { role: "CLIENT" } }),
      prismaClient.verificationRequest.count({ where: { status: "SUBMITTED" } }),
      prismaClient.verificationAgent.count({ where: { status: "ACTIVE" } }),
      prismaClient.property.count({ where: { status: "VERIFIED" } }),
    ]);

  const admin = await prismaClient.user.create({
    data: {
      fullName: "Dashboard Stats Admin",
      email: `dashboard-stats-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  adminToken = generateToken({ id: admin.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Dashboard Stats Client",
      email: `dashboard-stats-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;

  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Dashboard Stats Agent",
      email: `dashboard-stats-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;

  const service = await prismaClient.service.create({
    data: {
      name: `Dashboard Stats Service ${suffix}`,
      slug: `dashboard-stats-service-${suffix}`,
    },
  });
  serviceId = service.id;

  const type = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Residential Property",
      slug: `dashboard-stats-type-${suffix}`,
    },
  });
  typeId = type.id;

  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId: typeId,
      status: "SUBMITTED",
      details: { propertyType: "RESIDENTIAL", propertyAddress: "Lagos, Nigeria" },
    },
  });
  requestId = verificationRequest.id;

  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Dashboard Stats Agent", status: "ACTIVE" },
  });
  agentId = agent.id;

  const property = await prismaClient.property.create({
    data: {
      name: `Dashboard Stats Property ${suffix}`,
      address: "Lagos, Nigeria",
      status: "VERIFIED",
    },
  });
  propertyId = property.id;
});

afterAll(async () => {
  if (!adminId) {
    await prismaClient.$disconnect();
    return;
  }
  await prismaClient.property.delete({ where: { id: propertyId } });
  await prismaClient.verificationRequest.delete({ where: { id: requestId } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: typeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [adminId, clientId, agentUserId] } } });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/dashboard/stats", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/admin/dashboard/stats");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const clientToken = generateToken({ id: clientId });
    const res = await request(app)
      .get("/api/v1/admin/dashboard/stats")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it("returns dashboard statistics from the database", async () => {
    const res = await request(app)
      .get("/api/v1/admin/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalUsers: baselineClients + 1,
      numberOfPendingRequest: baselinePending + 1,
      numberOfActiveAgents: baselineActiveAgents + 1,
      numberOfProperties: baselineVerifiedProperties + 1,
    });
  });
});
