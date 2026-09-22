import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
let adminId: string;
let clientIds: string[] = [];
let agentUserId: string;
let agentId: string;
let serviceId: string;
let typeId: string;
let requestIds: string[] = [];
let assignmentIds: string[] = [];
let adminToken: string;

beforeAll(async () => {
  const admin = await prismaClient.user.create({
    data: {
      fullName: "Verification Requests Admin",
      email: `verification-requests-admin-${suffix}@example.com`,
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  adminToken = generateToken({ id: admin.id });

  const clientData = ["Pending", "Assigned", "Progress", "Completed"].map((label) => ({
    fullName: `Verification ${label} Client`,
    email: `verification-requests-${label.toLowerCase()}-${suffix}@example.com`,
    role: "CLIENT" as const,
  }));
  const clients = await Promise.all(clientData.map((data) => prismaClient.user.create({ data })));
  clientIds = clients.map((client) => client.id);

  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Verification Requests Agent",
      email: `verification-requests-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;

  const service = await prismaClient.service.create({
    data: {
      name: `Verification Requests Service ${suffix}`,
      slug: `verification-requests-service-${suffix}`,
    },
  });
  serviceId = service.id;

  const type = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Residential Property",
      slug: `verification-requests-type-${suffix}`,
    },
  });
  typeId = type.id;

  const requestData = [
    {
      status: "SUBMITTED" as const,
      propertyType: "RESIDENTIAL",
      propertyAddress: "Lagos, Nigeria",
    },
    { status: "SUBMITTED" as const, propertyType: "COMMERCIAL", propertyAddress: "Abuja, Nigeria" },
    {
      status: "IN_PROGRESS" as const,
      propertyType: "RESIDENTIAL",
      propertyAddress: "Ibadan, Nigeria",
    },
    {
      status: "COMPLETED" as const,
      propertyType: "RESIDENTIAL",
      propertyAddress: "Lagos, Nigeria",
    },
  ];
  const verificationRequests = await Promise.all(
    requestData.map((data, index) =>
      prismaClient.verificationRequest.create({
        data: {
          userId: clientIds[index],
          verificationTypeId: typeId,
          status: data.status,
          details: {
            propertyType: data.propertyType,
            propertyAddress: data.propertyAddress,
          },
        },
      }),
    ),
  );
  requestIds = verificationRequests.map((item) => item.id);

  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Verification Requests Agent", region: "Lagos" },
  });
  agentId = agent.id;

  const assigned = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestIds[1],
      agentId,
      status: "ASSIGNED",
    },
  });
  assignmentIds.push(assigned.id);

  const inProgress = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: requestIds[2],
      agentId,
      status: "INSPECTION_SCHEDULED",
    },
  });
  assignmentIds.push(inProgress.id);
});

afterAll(async () => {
  await prismaClient.agentAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationType.delete({ where: { id: typeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({
    where: { id: { in: [adminId, agentUserId, ...clientIds] } },
  });
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/verification-requests", () => {
  it("requires authentication and admin access", async () => {
    const unauthenticated = await request(app).get("/api/v1/admin/verification-requests");
    expect(unauthenticated.status).toBe(401);

    const clientToken = generateToken({ id: clientIds[0] });
    const nonAdmin = await request(app)
      .get("/api/v1/admin/verification-requests")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(nonAdmin.status).toBe(403);
  });

  it("returns the requested response shape and tab counts", async () => {
    const res = await request(app)
      .get("/api/v1/admin/verification-requests")
      .query({ search: "Verification Pending", page: 1, limit: 10 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalItems: 1, totalPages: 1 });
    expect(res.body.counts).toEqual({
      all: 1,
      pending: 1,
      assigned: 0,
      inProgress: 0,
      completed: 0,
    });
    expect(res.body.data).toEqual([
      expect.objectContaining({
        id: requestIds[0],
        client: expect.objectContaining({ name: "Verification Pending Client" }),
        propertyType: "RESIDENTIAL",
        location: { city: "Lagos", country: "Nigeria" },
        status: "PENDING",
        agent: null,
      }),
    ]);
  });

  it("filters assigned requests and sorts by status", async () => {
    const res = await request(app)
      .get("/api/v1/admin/verification-requests")
      .query({ status: "assigned", agentId, sortBy: "status", sortOrder: "asc" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.totalItems).toBe(1);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: requestIds[1],
        status: "ASSIGNED",
        agent: { id: agentId, name: "Verification Requests Agent" },
      }),
    );
  });

  it("rejects invalid query parameters", async () => {
    const res = await request(app)
      .get("/api/v1/admin/verification-requests")
      .query({ status: "unknown" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});
