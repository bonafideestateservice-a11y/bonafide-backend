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
const testEmail = `patch-verification-request-plan-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationPlanId: string;
let verificationRequestId: string;
let serviceId: string;

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}/plan`;

describe("PATCH /api/v1/client/verification-requests/:id/plan (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Patch Verification Request Plan Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Patch Plan Service ${testSuffix}`,
        slug: `patch-plan-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `patch-plan-property-${testSuffix}`,
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
      status: "DRAFT",
      details: {
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
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
    const res = await request(app).patch(endpoint()).send({ verificationPlanId });

    expect(res.status).toBe(401);
  });

  it("returns 400 when verificationPlanId is missing", async () => {
    const res = await request(app)
      .patch(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("selects and persists the verification plan", async () => {
    const res = await request(app)
      .patch(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .send({ verificationPlanId });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: verificationRequestId,
      status: "DRAFT",
      verificationPlanId,
      plan: {
        frequency: "ONE_TIME",
        name: "One time verification",
        priceInCents: 4500,
        currency: "USD",
      },
    });

    const storedRequest = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });
    expect(storedRequest?.verificationPlanId).toBe(verificationPlanId);
  });
});
