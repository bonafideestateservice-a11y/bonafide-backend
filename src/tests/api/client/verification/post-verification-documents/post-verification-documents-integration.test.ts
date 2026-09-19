import request from "supertest";
import { v2 as cloudinary } from "cloudinary";
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
const testEmail = `post-verification-documents-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let serviceId: string;
let documentId: string;
let cloudinaryPublicId: string;

const imageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}/documents`;

describe("POST /api/v1/client/verification-requests/:id/documents (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Post Verification Documents Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Post Verification Documents Service ${testSuffix}`,
        slug: `post-verification-documents-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `post-documents-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

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
    if (cloudinaryPublicId) {
      await cloudinary.uploader.destroy(cloudinaryPublicId, {
        resource_type: "image",
      });
    }
    if (documentId) {
      await prismaClient.document.delete({ where: { id: documentId } });
    }
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

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).post(endpoint()).attach("file", imageBuffer, "property.png");

    expect(res.status).toBe(401);
  });

  it("returns 400 when the file field is missing", async () => {
    const res = await request(app)
      .post(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .field("description", "property title");

    expect(res.status).toBe(400);
  });

  it("uploads and persists a verification document", async () => {
    const res = await request(app)
      .post(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", imageBuffer, {
        filename: "property.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      url: expect.stringContaining("https://res.cloudinary.com/"),
      fileName: "property.png",
      fileType: "image/png",
      fileSizeBytes: imageBuffer.length,
    });
    documentId = res.body.id;

    const cloudinaryUrl = new URL(res.body.url);
    expect(cloudinaryUrl.hostname).toBe("res.cloudinary.com");
    expect(res.body.url).toContain("bonafide-services");
    cloudinaryPublicId = res.body.url
      .split("/upload/")[1]
      .replace(/^v\d+\//, "")
      .replace(/\.[^/.]+$/, "");

    const storedDocument = await prismaClient.document.findUnique({
      where: { id: documentId },
    });
    expect(storedDocument).toEqual(
      expect.objectContaining({
        verificationRequestId,
        url: res.body.url,
        fileName: "property.png",
        fileType: "image/png",
        fileSizeBytes: imageBuffer.length,
      }),
    );
  });
});
