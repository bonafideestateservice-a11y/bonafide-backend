import { VerificationTierCode } from "@prisma/client";
import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn().mockResolvedValue({ secure_url: "https://cdn.test/site.jpg" }) },
  },
}));

const suffix = Date.now();
let userIds: string[] = [];
let serviceId: string;
let verificationTypeId: string;
let clientId: string;
let agentId: string;
let verificationRequestId: string;
let assignmentId: string;
let subscriptionPeriodId: string;
let agentToken: string;
let verificationTierId: string;
let createdVerificationTier = false;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Site Visit Workflow Agent",
      email: `site-visit-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  const client = await prismaClient.user.create({
    data: {
      fullName: "Site Visit Workflow Client",
      email: `site-visit-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  userIds = [agentUser.id, client.id];
  clientId = client.id;
  agentToken = generateToken({ id: agentUser.id });

  const service = await prismaClient.service.create({
    data: {
      name: `Site Visit Workflow Service ${suffix}`,
      slug: `site-visit-workflow-service-${suffix}`,
    },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Site Visit Workflow Verification",
      slug: `site-visit-workflow-type-${suffix}`,
    },
  });
  verificationTypeId = verificationType.id;

  const existingTier = await prismaClient.verificationTier.findUnique({
    where: { code: VerificationTierCode.BASIC },
    select: { id: true },
  });
  if (existingTier) {
    verificationTierId = existingTier.id;
  } else {
    const tier = await prismaClient.verificationTier.create({
      data: {
        code: VerificationTierCode.BASIC,
        name: "Basic",
        description: "Site visit integration-test tier",
        priceUsdCents: 2500,
      },
    });
    verificationTierId = tier.id;
    createdVerificationTier = true;
  }

  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId,
      verificationTierId,
      status: "IN_PROGRESS",
      details: { propertyAddress: "1 Test Street" },
    },
  });
  verificationRequestId = verificationRequest.id;

  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUser.id, name: "Site Visit Workflow Agent" },
  });
  agentId = agent.id;

  const transaction = await prismaClient.transaction.create({
    data: {
      verificationRequestId,
      amountInCents: 5000,
      method: "CARD",
      status: "SUCCESS",
      paidAt: new Date(),
    },
  });
  const monitoringSubscription = await prismaClient.monitoringSubscription.create({
    data: {
      userId: clientId,
      verificationRequestId,
      provider: "PAYSTACK",
      providerSubscriptionId: `SITE_VISIT_${suffix}`,
      interval: "MONTHLY",
      checksPerPeriod: 2,
    },
  });
  const period = await prismaClient.subscriptionPeriod.create({
    data: {
      verificationRequestId,
      monitoringSubscriptionId: monitoringSubscription.id,
      paidTransactionId: transaction.id,
      periodStart: new Date("2026-11-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-01T00:00:00.000Z"),
      requiredSiteVisits: 2,
    },
  });
  subscriptionPeriodId = period.id;

  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId,
      agentId,
      transactionId: transaction.id,
      status: "ACCEPTED",
    },
  });
  assignmentId = assignment.id;

  await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignmentId,
      label: "Physical/site visit",
      sectionKey: "site_visit",
      sortOrder: 0,
    },
  });

  await prismaClient.siteVisit.createMany({
    data: [1, 2].map((visitNumber) => ({
      verificationRequestId,
      subscriptionPeriodId,
      visitNumber,
    })),
  });
});

afterAll(async () => {
  if (verificationRequestId) {
    await prismaClient.document.deleteMany({ where: { verificationRequestId } });
    await prismaClient.verificationChecklistItem.deleteMany({
      where: { agentAssignmentId: assignmentId },
    });
    await prismaClient.siteVisit.deleteMany({ where: { verificationRequestId } });
    await prismaClient.agentAssignment.deleteMany({ where: { verificationRequestId } });
    await prismaClient.subscriptionPeriod.deleteMany({ where: { verificationRequestId } });
    await prismaClient.monitoringSubscription.deleteMany({ where: { verificationRequestId } });
    await prismaClient.transaction.deleteMany({ where: { verificationRequestId } });
    await prismaClient.verificationRequest.deleteMany({ where: { id: verificationRequestId } });
  }
  if (agentId) await prismaClient.verificationAgent.deleteMany({ where: { id: agentId } });
  if (verificationTypeId) {
    await prismaClient.verificationType.deleteMany({ where: { id: verificationTypeId } });
  }
  if (serviceId) await prismaClient.service.deleteMany({ where: { id: serviceId } });
  if (createdVerificationTier) {
    await prismaClient.verificationTier.deleteMany({ where: { id: verificationTierId } });
  }
  if (userIds.length) await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
  await prismaClient.$disconnect();
});

describe("Recurring site-visit checklist synchronization", () => {
  it("shows assigned visits with their paid-period progress", async () => {
    const response = await request(app)
      .get(`/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.period).toMatchObject({
      requiredSiteVisits: 2,
      completedSiteVisits: 0,
      siteVisits: [
        { visitNumber: 1, status: "PENDING", completedAt: null },
        { visitNumber: 2, status: "PENDING", completedAt: null },
      ],
    });
  });

  it("creates one checklist item per recurring visit and synchronizes completed records", async () => {
    const start = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/start`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(start.status).toBe(200);
    expect(start.body.checklist.map((item: { sectionKey: string }) => item.sectionKey)).toEqual([
      "site_visit_1",
      "site_visit_2",
      "court_crime_verification",
      "title_deeds_verification",
      "valuation_verification",
      "amenities_environment_verification",
    ]);

    const siteVisitItems = start.body.checklist.filter((item: { id: string; sectionKey: string }) =>
      item.sectionKey.startsWith("site_visit_"),
    );
    for (const [index, item] of siteVisitItems.entries()) {
      const response = await request(app)
        .patch(`/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${item.id}`)
        .set("Authorization", `Bearer ${agentToken}`)
        .field("status", "COMPLETE")
        .field(
          "result",
          JSON.stringify({ visitOutcome: "Accessible", notes: `Visit ${index + 1}` }),
        )
        .attach("media", Buffer.from("site photo"), {
          filename: `site-${index + 1}.jpg`,
          contentType: "image/jpeg",
        });
      expect(response.status).toBe(200);
    }

    const visits = await prismaClient.siteVisit.findMany({
      where: { subscriptionPeriodId },
      orderBy: { visitNumber: "asc" },
    });
    expect(visits.map((visit) => visit.status)).toEqual(["COMPLETED", "COMPLETED"]);
    expect(visits.every((visit) => visit.completedAt instanceof Date)).toBe(true);

    const period = await prismaClient.subscriptionPeriod.findUniqueOrThrow({
      where: { id: subscriptionPeriodId },
    });
    expect(period.completedSiteVisits).toBe(2);

    const retry = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${siteVisitItems[0].id}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ status: "COMPLETE" });
    expect(retry.status).toBe(200);
    await expect(
      prismaClient.subscriptionPeriod.findUniqueOrThrow({ where: { id: subscriptionPeriodId } }),
    ).resolves.toMatchObject({ completedSiteVisits: 2 });
  }, 120000);
});
