import request from "supertest";
import app from "../../../../../app";
import { createVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { prismaClient } from "../../../../../utils/prisma";

const testSuffix = Date.now();
let verificationServiceId: string;
let createdService = false;
const createdVerificationTypeIds: string[] = [];

describe("GET /api/v1/client/services/verification/verification-types (integration, real DB)", () => {
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
      name: "Property Verification Test",
      slug: `property-verification-test-${testSuffix}`,
      description: "Verify property ownership and condition.",
      icon: "property",
    });
    createdVerificationTypeIds.push(verificationType.id);
  });

  afterAll(async () => {
    await prismaClient.verificationType.deleteMany({
      where: { id: { in: createdVerificationTypeIds } },
    });

    if (createdService) {
      await prismaClient.service.delete({
        where: { id: verificationServiceId },
      });
    }

    await prismaClient.$disconnect();
  });

  it("returns verification category cards without authentication", async () => {
    const res = await request(app).get(
      "/api/v1/client/services/verification/verification-types",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdVerificationTypeIds[0],
          name: "Property Verification Test",
          slug: `property-verification-test-${testSuffix}`,
          description: "Verify property ownership and condition.",
          icon: "property",
        }),
      ]),
    );
  });

  it("returns only the documented category fields", async () => {
    const res = await request(app).get(
      "/api/v1/client/services/verification/verification-types",
    );

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        slug: expect.any(String),
        description: expect.any(String),
      }),
    );
    expect(Object.keys(res.body[0]).sort()).toEqual([
      "description",
      "icon",
      "id",
      "name",
      "slug",
    ]);
  });
});
