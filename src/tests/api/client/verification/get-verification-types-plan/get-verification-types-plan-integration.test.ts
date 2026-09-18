import request from "supertest";
import app from "../../../../../app";
import { createVerificationPlan } from "../../../../../api/client/verification/services/database/verification-plan";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
const verificationTypeSlug = `property-plans-${testSuffix}`;
let verificationServiceId: string;
let verificationTypeId: string;
let createdService = false;

const endpoint = `/api/v1/client/verification-types/${verificationTypeSlug}/plans`;

describe("GET /api/v1/client/verification-types/:slug/plans (integration, real DB)", () => {
  beforeAll(async () => {
    let verificationService = await prismaClient.service.findUnique({
      where: { slug: "verification" },
    });

    if (!verificationService) {
      verificationService = await prismaClient.service.create({
        data: {
          name: "Verification",
          slug: "verification",
          description: "Test verification service",
        },
      });
      createdService = true;
    }

    verificationServiceId = verificationService.id;

    const verificationType = await createVerificationType({
      serviceId: verificationServiceId,
      name: "Property Verification Plans Test",
      slug: verificationTypeSlug,
      description: "Verify property plans.",
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    await createVerificationPlan({
      verificationTypeId,
      frequency: "ONE_TIME",
      name: "One time verification",
      description: "A single inspection with a full report",
      priceInCents: 4500,
      currency: "NGN",
    });
    await createVerificationPlan({
      verificationTypeId,
      frequency: "MONTHLY",
      name: "Monthly Update",
      description: "Detailed report every month",
      priceInCents: 3500,
      currency: "NGN",
    });
    await createVerificationPlan({
      verificationTypeId,
      frequency: "QUARTERLY",
      name: "Quarterly Update",
      description: null,
      priceInCents: 3500,
      currency: "NGN",
    });
  });

  afterAll(async () => {
    if (verificationTypeId) {
      await prismaClient.verificationPlan.deleteMany({
        where: { verificationTypeId },
      });
      await prismaClient.verificationType.delete({
        where: { id: verificationTypeId },
      });
    }

    if (createdService) {
      await prismaClient.service.delete({
        where: { id: verificationServiceId },
      });
    }

    await prismaClient.$disconnect();
  });

  it("returns the seeded plan card fields without authentication", async () => {
    const res = await request(app).get(endpoint);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: expect.any(String),
        frequency: "ONE_TIME",
        name: "One time verification",
        description: "A single inspection with a full report",
        priceInCents: 4500,
        currency: "NGN",
      },
      {
        id: expect.any(String),
        frequency: "MONTHLY",
        name: "Monthly Update",
        description: "Detailed report every month",
        priceInCents: 3500,
        currency: "NGN",
      },
      {
        id: expect.any(String),
        frequency: "QUARTERLY",
        name: "Quarterly Update",
        description: "",
        priceInCents: 3500,
        currency: "NGN",
      },
    ]);
  });

  it("returns an empty array for an unknown verification type slug", async () => {
    const res = await request(app).get(
      "/api/v1/client/verification-types/unknown-verification/plans",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
