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
const testEmail = `post-verification-request-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let constructionTypeId: string;
let constructionRequestId: string;
let createdConstructionType = false;
let serviceId: string;

const endpoint = "/api/v1/client/verification-requests";

describe("POST /api/v1/client/verification-requests (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Post Verification Request Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Post Verification Service ${testSuffix}`,
        slug: `post-verification-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `post-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    let constructionType = await prismaClient.verificationType.findUnique({
      where: { slug: "construction-progress" },
    });
    if (!constructionType) {
      constructionType = await createVerificationType({
        serviceId,
        name: "Construction Progress",
        slug: "construction-progress",
        icon: "construction",
      });
      createdConstructionType = true;
    }
    constructionTypeId = constructionType.id;
  });

  afterAll(async () => {
    if (verificationRequestId) {
      await prismaClient.verificationRequest.delete({
        where: { id: verificationRequestId },
      });
    }
    if (constructionRequestId) {
      await prismaClient.verificationRequest.delete({
        where: { id: constructionRequestId },
      });
    }
    await prismaClient.verificationType.delete({
      where: { id: verificationTypeId },
    });
    if (createdConstructionType) {
      await prismaClient.verificationType.delete({
        where: { id: constructionTypeId },
      });
    }
    await prismaClient.service.delete({ where: { id: serviceId } });
    await deleteClient({ id: testUserId });
    await prismaClient.$disconnect();
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({
        verificationTypeId,
        details: {
          propertyType: "COMPLETED_BUILDING",
          propertyAddress: "12 Admiralty Way",
        },
      });

    expect(res.status).toBe(401);
  });

  it("returns 400 when required property details are missing", async () => {
    const res = await request(app)
      .post(endpoint)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        verificationTypeId,
        details: { propertyType: "COMPLETED_BUILDING" },
      });

    expect(res.status).toBe(400);
  });

  it("creates a draft verification request with property details", async () => {
    const res = await request(app)
      .post(endpoint)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        verificationTypeId,
        details: {
          propertyName: "Lekki Apartment",
          propertyType: "COMPLETED_BUILDING",
          propertyAddress: "12 Admiralty Way",
        },
        additionalNote: "Inspect the foundation.",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      status: "DRAFT",
      verificationTypeId,
      details: {
        propertyName: "Lekki Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      additionalNote: "Inspect the foundation.",
      createdAt: expect.any(String),
    });

    verificationRequestId = res.body.id;

    const storedRequest = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
    });
    expect(storedRequest).toEqual(
      expect.objectContaining({
        userId: testUserId,
        verificationTypeId,
        status: "DRAFT",
        additionalNote: "Inspect the foundation.",
      }),
    );
  });

  it("creates a construction request with construction-specific details", async () => {
    const res = await request(app)
      .post(endpoint)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        verificationTypeId: constructionTypeId,
        details: {
          constructionAddress: "14 Admiralty Way",
          projectType: "3 Storey Building",
          currentConstructionStage: "Foundation Completed",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.details).toEqual({
      constructionAddress: "14 Admiralty Way",
      projectType: "3 Storey Building",
      currentConstructionStage: "Foundation Completed",
    });
    constructionRequestId = res.body.id;

    const storedRequest = await prismaClient.verificationRequest.findUnique({
      where: { id: constructionRequestId },
    });
    expect(storedRequest).toEqual(
      expect.objectContaining({
        userId: testUserId,
        verificationTypeId: constructionTypeId,
        details: {
          constructionAddress: "14 Admiralty Way",
          projectType: "3 Storey Building",
          currentConstructionStage: "Foundation Completed",
        },
      }),
    );
  });
});
