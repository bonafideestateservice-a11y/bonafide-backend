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
const testEmail = `patch-prefs-${testSuffix}@example.com`;
let testUserId: string;
let authToken: string;
let verificationTypeId: string;
let verificationRequestId: string;
let serviceId: string;

const endpoint = () => `/api/v1/client/verification-requests/${verificationRequestId}/notification-preferences`;

describe("PATCH /api/v1/client/verification-requests/:id/notification-preferences (integration, real DB)", () => {
  beforeAll(async () => {
    const user = await createClient({
      email: testEmail,
      fullName: "Patch Prefs Test User",
    });
    testUserId = user.id;
    authToken = generateToken({ id: user.id });

    const service = await prismaClient.service.create({
      data: {
        name: `Patch Prefs Service ${testSuffix}`,
        slug: `patch-prefs-service-${testSuffix}`,
      },
    });
    serviceId = service.id;

    const verificationType = await createVerificationType({
      serviceId,
      name: "Property Verification",
      slug: `patch-prefs-property-verification-${testSuffix}`,
      icon: "property",
    });
    verificationTypeId = verificationType.id;

    const verificationRequest = await createVerificationRequest({
      userId: testUserId,
      verificationTypeId,
      status: "DRAFT",
      details: {
        propertyAddress: "123 Patch Ave",
      },
      notifyOnInspectionStart: true,
      notifyOnReportReady: true
    } as any); 
    verificationRequestId = verificationRequest.id;
  });

  afterAll(async () => {
    if (verificationRequestId) {
      await prismaClient.verificationRequest.delete({
        where: { id: verificationRequestId },
      });
    }
    if (verificationTypeId) {
      await prismaClient.verificationType.delete({
        where: { id: verificationTypeId },
      });
    }
    if (serviceId) {
      await prismaClient.service.delete({ where: { id: serviceId } });
    }
    if (testUserId) {
      await deleteClient({ id: testUserId });
    }
    
    await prismaClient.$disconnect();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).patch(endpoint()).send({ notifyOnInspectionStart: false });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a non-existent tracking id", async () => {
    const res = await request(app)
      .patch(`/api/v1/client/verification-requests/req-99999/notification-preferences`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ notifyOnInspectionStart: false });
    expect(res.status).toBe(404);
  });
  
  it("returns 400 when body does not contain valid boolean preferences", async () => {
    const res = await request(app)
      .patch(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .send({ notifyOnInspectionStart: "yes" });
    expect(res.status).toBe(400);
  });

  it("updates preferences correctly", async () => {
    const res = await request(app)
      .patch(endpoint())
      .set("Authorization", `Bearer ${authToken}`)
      .send({ notifyOnInspectionStart: false, notifyOnReportReady: false });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.notifyOnInspectionStart).toBe(false);
    expect(res.body.data.notifyOnReportReady).toBe(false);
    
    // Verify in DB
    const dbRecord = await prismaClient.verificationRequest.findUnique({
        where: { id: verificationRequestId }
    });
    expect(dbRecord?.notifyOnInspectionStart).toBe(false);
    expect(dbRecord?.notifyOnReportReady).toBe(false);
  });
});
