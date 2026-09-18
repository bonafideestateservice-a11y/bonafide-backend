import request from "supertest";
import app from "../../../../../app";
import {
  createClient,
  deleteClient,
} from "../../../../../api/client/authentication/services/database/client";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const testEmail = `patch-verification-request-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let businessTypeId: string;
let businessRequestId: string;
let serviceId: string;
let createdBusinessType = false;

const endpoint = () =>
  `/api/v1/client/verification-requests/${verificationRequestId}`;

describe("PATCH /api/v1/client/verification-requests/:id (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Patch Verification Request Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Patch Verification Service ${testSuffix}`,
        slug: `patch-verification-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `patch-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    let businessType = await prismaClient.verificationType.findUnique({
      where: { slug: "business-verification" },
    });
    if (!businessType) {
      businessType = await createVerificationType({
        serviceId,
        name: "Business Verification",
        slug: "business-verification",
        icon: "business",
      });
      createdBusinessType = true;
    }
    businessTypeId = businessType.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      status: "DRAFT",
      details: {
        propertyName: "Old Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "Old Address",
      },
      additionalNote: "Initial note",
    });
    verificationRequestId = verificationRequest.id;

    const businessRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId: businessTypeId,
      status: "DRAFT",
      details: {
        businessName: "Old Business",
        businessType: "Retail Store",
        businessAddress: "Old Address",
      },
    });
    businessRequestId = businessRequest.id;
  });

  afterAll(async () => {
    if (verificationRequestId) {
      await prismaClient.verificationRequest.delete({
        where: { id: verificationRequestId },
      });
    }
    await prismaClient.verificationType.delete({
      where: { id: verificationTypeId },
    });
    await prismaClient.service.delete({ where: { id: serviceId } });
    await deleteClient({ id: testUserId });
    await prismaClient.$disconnect();
  });

  if (businessRequestId) {
    await prismaClient.verificationRequest.delete({
      where: { id: businessRequestId },
    });
  }
  it("returns 401 when no auth token is provided", async () => {
    if (createdBusinessType) {
      await prismaClient.verificationType.delete({
        where: { id: businessTypeId },
      });
    }
    const res = await request(app)
      .patch(endpoint())
      .send({ additionalNote: "Updated note" });

    expect(res.status).toBe(401);
  });

  it("returns 400 when no update fields are provided", async () => {
    const res = await request(app)
      .patch(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("updates details and additionalNote in the verification request", async () => {
    const res = await request(app)
      .patch(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        details: {
          propertyName: " Updated Apartment ",
          propertyAddress: "12 Admiralty Way",
        },
        additionalNote: " Inspect the foundation. ",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: verificationRequestId,
        userId: testUserId,
        verificationTypeId,
        status: "DRAFT",
        details: {
          propertyName: "Updated Apartment",
          propertyType: "COMPLETED_BUILDING",
          propertyAddress: "12 Admiralty Way",
        },
        additionalNote: "Inspect the foundation.",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    );

    const storedRequest = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });
    expect(storedRequest).toEqual(
      expect.objectContaining({
        details: {
          propertyName: "Updated Apartment",
          propertyType: "COMPLETED_BUILDING",
          propertyAddress: "12 Admiralty Way",
        },
        additionalNote: "Inspect the foundation.",
      }),
    );
  });

  it("updates business-specific details", async () => {
    const res = await request(app)
      .patch(`/api/v1/client/verification-requests/${businessRequestId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ details: { businessAddress: "20 Marina Road" } });

    expect(res.status).toBe(200);
    expect(res.body.details).toEqual({
      businessName: "Old Business",
      businessType: "Retail Store",
      businessAddress: "20 Marina Road",
    });
  });
});
