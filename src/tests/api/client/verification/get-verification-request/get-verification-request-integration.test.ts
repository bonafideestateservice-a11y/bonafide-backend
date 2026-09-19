import request from "supertest";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { createVerificationPlan } from "../../../../../api/client/verification/services/database/verification-plan";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `get-verification-request-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationPlanId: string;
let verificationRequestId: string;
let serviceId: string;

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}`;

describe("GET /api/v1/client/verification-requests/:id (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Get Verification Request Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Get Verification Request Service ${testSuffix}`,
        slug: `get-verification-request-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `get-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    const verificationPlan = await createVerificationPlan({
      verificationTypeId,
      frequency: "ONE_TIME",
      name: "One time verification",
      description: "A single inspection with a full report",
      priceInCents: 4500,
      currency: "USD",
    });
    verificationPlanId = verificationPlan.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      verificationPlanId,
      status: "DRAFT",
      details: {
        propertyName: "Lekki Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      additionalNote: "Inspect the foundation.",
    });
    verificationRequestId = verificationRequest.id;
  });

  afterAll(async () => {
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
    await prismaClient.verificationType.delete({
      where: { id: verificationTypeId },
    });
    await prismaClient.service.delete({ where: { id: serviceId } });
    await deleteClient({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).get(endpoint());

    expect(res.status).toBe(401);
  });

  it("returns the summary with location details and selected plan", async () => {
    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: verificationRequestId,
      status: "DRAFT",
      verificationType: { name: "Property Verification" },
      details: {
        propertyName: "Lekki Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      plan: {
        frequency: "ONE_TIME",
        name: "One time verification",
        priceInCents: 4500,
        currency: "USD",
      },
      createdAt: expect.any(String),
    });
  });

  it("returns 404 for a request owned by another user", async () => {
    const otherUser = await createClient({
      email: `get-verification-request-other-${testSuffix}@example.com`,
      fullName: "Other User",
    });
    const otherToken = generateToken({ id: otherUser.id });

    const res = await request(app).get(endpoint()).set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
    await deleteClient({ id: otherUser.id });
  });
});
