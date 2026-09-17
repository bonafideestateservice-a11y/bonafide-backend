import request from "supertest";
import app from "../../../../../app";
import { createClient, deleteClient } from "../../../../../api/client/authentication/services/database/client";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `verification-requests-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let serviceId: string;

describe("GET /api/v1/client/verification-requests (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Verification Requests Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Property Verification ${testSuffix}`,
        slug: `property-verification-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Verification",
      slug: `verification-${testSuffix}`,
      icon: "building",
    });
    verificationTypeId = verificationType.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      status: "IN_PROGRESS",
      details: { propertyName: "Lekki Phase 1 Apartment" },
    });
    verificationRequestId = verificationRequest.id;
  });

  afterAll(async () => {
    await prismaClient.verificationRequest.delete({ where: { id: verificationRequestId } });
    await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
    await prismaClient.service.delete({ where: { id: serviceId } });
    await deleteClient({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get("/api/v1/client/verification-requests");

    expect(res.status).toBe(401);
  });

  it("returns the user's recent verification requests", async () => {
    const res = await request(app)
      .get("/api/v1/client/verification-requests?limit=5")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: verificationRequestId,
        title: "Lekki Phase 1 Apartment",
        verificationType: { name: "Verification", icon: "building" },
        status: "IN_PROGRESS",
      }),
    ]);
    expect(res.body[0].updatedAt).toBeDefined();
  });

  it("returns 400 when limit is invalid", async () => {
    const res = await request(app)
      .get("/api/v1/client/verification-requests?limit=0")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });
});
