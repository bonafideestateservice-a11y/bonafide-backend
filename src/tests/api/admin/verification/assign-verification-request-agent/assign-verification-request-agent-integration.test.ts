import request from "supertest";
import { VerificationStatus } from "@prisma/client";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
const userIds: string[] = [];
const agentIds: string[] = [];
const requestIds: string[] = [];
let serviceId: string;
let verificationTypeId: string;
let clientId: string;
let adminToken: string;
let agentToken: string;
let activeAgentId: string;
let inactiveAgentId: string;

const createUser = async (role: "ADMIN" | "AGENT" | "CLIENT", label: string) => {
  const user = await prismaClient.user.create({
    data: {
      fullName: `Assign Agent ${label}`,
      email: `assign-agent-${label}-${suffix}@example.com`,
      role,
    },
  });
  userIds.push(user.id);
  return user;
};

const createAgent = async (label: string, status: "ACTIVE" | "INACTIVE") => {
  const user = await createUser("AGENT", label);
  const agent = await prismaClient.verificationAgent.create({
    data: { userId: user.id, name: `Assign Agent ${label}`, status },
  });
  agentIds.push(agent.id);
  return { user, agent };
};

const createRequest = async (status: VerificationStatus, { paid = true } = {}) => {
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId,
      status,
      details: { propertyAddress: "Lagos" },
    },
  });
  requestIds.push(verificationRequest.id);
  if (paid) {
    await prismaClient.transaction.create({
      data: {
        verificationRequestId: verificationRequest.id,
        amountInCents: 500000,
        method: "CARD",
        status: "SUCCESS",
        paidAt: new Date(),
      },
    });
  }
  return verificationRequest.id;
};

const paidTransactionId = async (verificationRequestId: string) =>
  (
    await prismaClient.transaction.findFirstOrThrow({
      where: { verificationRequestId, status: "SUCCESS" },
    })
  ).id;

const assign = (verificationRequestId: string, body: unknown, token = adminToken) =>
  request(app)
    .post(`/api/v1/admin/verification-requests/${verificationRequestId}/assign-agent`)
    .set("Authorization", `Bearer ${token}`)
    .send(body as object);

beforeAll(async () => {
  const admin = await createUser("ADMIN", "admin");
  adminToken = generateToken({ id: admin.id });

  const client = await createUser("CLIENT", "client");
  clientId = client.id;

  const active = await createAgent("active", "ACTIVE");
  activeAgentId = active.agent.id;
  agentToken = generateToken({ id: active.user.id });

  const inactive = await createAgent("inactive", "INACTIVE");
  inactiveAgentId = inactive.agent.id;

  const service = await prismaClient.service.create({
    data: { name: `Assign Agent Service ${suffix}`, slug: `assign-agent-service-${suffix}` },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: { serviceId, name: "Property Verification", slug: `assign-agent-type-${suffix}` },
  });
  verificationTypeId = verificationType.id;
});

afterAll(async () => {
  await prismaClient.agentAssignment.deleteMany({
    where: { verificationRequestId: { in: requestIds } },
  });
  await prismaClient.transaction.deleteMany({
    where: { verificationRequestId: { in: requestIds } },
  });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prismaClient.verificationAgent.deleteMany({ where: { id: { in: agentIds } } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
  await prismaClient.$disconnect();
});

describe("POST /api/v1/admin/verification-requests/:id/assign-agent", () => {
  it("returns 401 without an authentication token", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);

    const response = await request(app)
      .post(`/api/v1/admin/verification-requests/${verificationRequestId}/assign-agent`)
      .send({ agentId: activeAgentId });

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);

    const response = await assign(verificationRequestId, { agentId: activeAgentId }, agentToken);

    expect(response.status).toBe(403);
  });

  it("returns 400 when agentId is missing", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);

    const response = await assign(verificationRequestId, {});

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown verification request", async () => {
    const response = await assign("missing-request", { agentId: activeAgentId });

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown agent", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);

    const response = await assign(verificationRequestId, { agentId: "missing-agent" });

    expect(response.status).toBe(404);
  });

  it("returns 400 for an inactive agent", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);

    const response = await assign(verificationRequestId, { agentId: inactiveAgentId });

    expect(response.status).toBe(400);
  });

  it("returns 409 when the request has not been paid", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.PENDING_PAYMENT);

    const response = await assign(verificationRequestId, { agentId: activeAgentId });

    expect(response.status).toBe(409);
    await expect(
      prismaClient.agentAssignment.findUnique({ where: { verificationRequestId } }),
    ).resolves.toBeNull();
  });

  it("assigns the agent and moves the request to IN_PROGRESS", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);

    const response = await assign(verificationRequestId, { agentId: activeAgentId });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      verificationRequestId,
      status: "ASSIGNED",
      agent: { id: activeAgentId, name: "Assign Agent active" },
      createdAt: expect.any(String),
    });

    const verificationRequest = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      include: { agentAssignment: true },
    });
    expect(verificationRequest?.status).toBe(VerificationStatus.IN_PROGRESS);
    expect(verificationRequest?.agentAssignment?.agentId).toBe(activeAgentId);
    // The assignment covers the paid period.
    expect(verificationRequest?.agentAssignment?.transactionId).toBe(
      await paidTransactionId(verificationRequestId),
    );
  });

  it("returns 409 when the request has no paid period awaiting an agent", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED, {
      paid: false,
    });

    const response = await assign(verificationRequestId, { agentId: activeAgentId });

    expect(response.status).toBe(409);
    expect(response.body.message ?? response.body.error).toEqual(
      expect.stringContaining("no paid period"),
    );
    await expect(
      prismaClient.verificationRequest.findUnique({ where: { id: verificationRequestId } }),
    ).resolves.toEqual(expect.objectContaining({ status: VerificationStatus.SUBMITTED }));
  });

  it("returns 409 when the request already has an agent", async () => {
    const verificationRequestId = await createRequest(VerificationStatus.SUBMITTED);
    await assign(verificationRequestId, { agentId: activeAgentId });

    const response = await assign(verificationRequestId, { agentId: activeAgentId });

    expect(response.status).toBe(409);
    expect(await prismaClient.agentAssignment.count({ where: { verificationRequestId } })).toBe(1);
  });
});
