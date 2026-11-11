import { VerificationTierCode } from "@prisma/client";
import request from "supertest";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn().mockResolvedValue({
        public_id: "tiered-report-document",
        secure_url: "https://cdn.test/tiered-report-file",
      }),
      destroy: jest.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

const suffix = Date.now();
let agentUserId: string;
let agentId: string;
let clientId: string;
let serviceId: string;
let verificationTypeId: string;
let verificationTierId: string;
let clientToken: string;
let createdTier = false;
let verificationRequestId: string;
let assignmentId: string;
let reportId: string;
let agentToken: string;

beforeAll(async () => {
  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Tiered Report Agent",
      email: `tiered-report-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentToken = generateToken({ id: agentUser.id });

  const client = await prismaClient.user.create({
    data: {
      fullName: "Tiered Report Client",
      email: `tiered-report-client-${suffix}@example.com`,
      role: "CLIENT",
    },
  });
  clientId = client.id;
  clientToken = generateToken({ id: client.id });

  const service = await prismaClient.service.create({
    data: { name: `Tiered Report Service ${suffix}`, slug: `tiered-report-service-${suffix}` },
  });
  serviceId = service.id;

  const verificationType = await prismaClient.verificationType.create({
    data: {
      serviceId,
      name: "Property Verification",
      slug: `tiered-report-type-${suffix}`,
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
        description: "Integration-test tier",
        priceUsdCents: 2500,
      },
    });
    verificationTierId = tier.id;
    createdTier = true;
  }

  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId,
      verificationTierId,
      status: "IN_PROGRESS",
      details: { propertyAddress: "Plot 45, Lagos" },
    },
  });
  verificationRequestId = verificationRequest.id;

  const agent = await prismaClient.verificationAgent.create({
    data: { userId: agentUserId, name: "Tiered Report Agent" },
  });
  agentId = agent.id;

  const assignment = await prismaClient.agentAssignment.create({
    data: { verificationRequestId, agentId, status: "ACCEPTED" },
  });
  assignmentId = assignment.id;
});

afterAll(async () => {
  if (verificationRequestId) {
    await prismaClient.document.deleteMany({ where: { verificationRequestId } });
    const checklistConditions = [
      ...(assignmentId ? [{ agentAssignmentId: assignmentId }] : []),
      ...(reportId ? [{ reportId }] : []),
    ];
    if (checklistConditions.length > 0) {
      await prismaClient.verificationChecklistItem.deleteMany({
        where: { OR: checklistConditions },
      });
    }
    if (reportId) await prismaClient.verificationReport.delete({ where: { id: reportId } });
    if (assignmentId) await prismaClient.agentAssignment.delete({ where: { id: assignmentId } });
    await prismaClient.transaction.deleteMany({ where: { verificationRequestId } });
    await prismaClient.verificationRequest.deleteMany({ where: { id: verificationRequestId } });
  }
  if (agentId) await prismaClient.verificationAgent.deleteMany({ where: { id: agentId } });
  if (verificationTypeId) {
    await prismaClient.verificationType.deleteMany({ where: { id: verificationTypeId } });
  }
  if (serviceId) await prismaClient.service.deleteMany({ where: { id: serviceId } });
  if (createdTier && verificationTierId) {
    await prismaClient.verificationTier.deleteMany({ where: { id: verificationTierId } });
  }
  const userIds = [agentUserId, clientId].filter((id): id is string => Boolean(id));
  if (userIds.length > 0) {
    await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prismaClient.$disconnect();
});

describe("Tier-specific agent report workflow", () => {
  it("persists Basic evidence, uploads, and tier snapshots with the submitted report", async () => {
    const startResponse = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/start`)
      .set("Authorization", `Bearer ${agentToken}`);

    expect(startResponse.status).toBe(200);
    expect(
      startResponse.body.checklist.map((item: { sectionKey: string }) => item.sectionKey),
    ).toEqual([
      "site_visit",
      "court_crime_verification",
      "title_deeds_verification",
      "valuation_verification",
      "amenities_environment_verification",
    ]);

    const [siteVisit, courtCrime, titleDeeds, valuationVerif, amenitiesVerif] =
      startResponse.body.checklist;
    const media = Buffer.from("site photo");
    const docMedia = Buffer.from("title deed doc");

    const siteResponse = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${siteVisit.id}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .field("status", "COMPLETE")
      .field(
        "result",
        JSON.stringify({ visitOutcome: "Property accessible", notes: "Exterior inspected." }),
      )
      .attach("media", media, { filename: "site.jpg", contentType: "image/jpeg" });
    expect(siteResponse.status).toBe(200);

    const courtResponse = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${courtCrime.id}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .field("status", "COMPLETE")
      .field(
        "result",
        JSON.stringify({
          outcome: "No court or crime records found",
          notes: "Checked local records.",
        }),
      );
    expect(courtResponse.status).toBe(200);

    const deedResponse = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${titleDeeds.id}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .field("status", "COMPLETE")
      .field(
        "result",
        JSON.stringify({
          outcome: "Title deeds verified",
          notes: "Deed of assignment confirmed.",
        }),
      )
      .attach("media", docMedia, { filename: "deed.jpg", contentType: "image/jpeg" });
    expect(deedResponse.status).toBe(200);

    const valuationResponse = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${valuationVerif.id}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .field("status", "COMPLETE")
      .field(
        "result",
        JSON.stringify({
          outcome: "Valuation consistent with neighborhood",
          notes: "Market rates benchmarked.",
        }),
      );
    expect(valuationResponse.status).toBe(200);

    const amenitiesResponse = await request(app)
      .patch(
        `/api/v1/admin/verification/agent-assignments/${assignmentId}/checklist/${amenitiesVerif.id}`,
      )
      .set("Authorization", `Bearer ${agentToken}`)
      .field("status", "COMPLETE")
      .field(
        "result",
        JSON.stringify({
          outcome: "Amenities confirmed",
          notes: "Tarred access road and electricity present.",
        }),
      );
    expect(amenitiesResponse.status).toBe(200);

    const reportResponse = await request(app)
      .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .set("Authorization", `Bearer ${agentToken}`)
      .attach("report_document", Buffer.from("%PDF-1.4 test report"), {
        filename: "tiered-report.pdf",
        contentType: "application/pdf",
      });

    expect(reportResponse.status).toBe(201);
    reportId = reportResponse.body.id;

    const report = await prismaClient.verificationReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { checklistItems: { orderBy: { sortOrder: "asc" } } },
    });
    expect(report.verificationTierId).toBe(verificationTierId);
    expect(report.tierNameSnapshot).toBe("Basic");
    expect(report.packageScopeSnapshot).toMatchObject({
      tier: { id: verificationTierId, code: "BASIC" },
    });
    expect(report.summary).toBe(
      "Basic report includes 5 of 5 checklist sections marked complete. Review the section results and attached report for details.",
    );
    expect(report.findings).toMatchObject({
      tier: { id: verificationTierId, code: "BASIC" },
      sections: [
        {
          key: "site_visit",
          result: { visitOutcome: "Property accessible", notes: "Exterior inspected." },
          media: [{ url: "https://cdn.test/tiered-report-file", fileName: "site.jpg" }],
        },
        {
          key: "court_crime_verification",
          result: {
            outcome: "No court or crime records found",
            notes: "Checked local records.",
          },
        },
        {
          key: "title_deeds_verification",
          result: {
            outcome: "Title deeds verified",
            notes: "Deed of assignment confirmed.",
          },
          media: [{ url: "https://cdn.test/tiered-report-file", fileName: "deed.jpg" }],
        },
        {
          key: "valuation_verification",
          result: {
            outcome: "Valuation consistent with neighborhood",
            notes: "Market rates benchmarked.",
          },
        },
        {
          key: "amenities_environment_verification",
          result: {
            outcome: "Amenities confirmed",
            notes: "Tarred access road and electricity present.",
          },
        },
      ],
    });
    expect(report.checklistItems).toHaveLength(5);
    expect(report.checklistItems.every((item) => item.reportId === reportId)).toBe(true);
    expect(report.subscriptionPeriodId).toBeNull();

    const reportView = await request(app)
      .get(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
      .set("Authorization", `Bearer ${agentToken}`);
    expect(reportView.status).toBe(200);
    expect(reportView.body.checklist).toEqual([
      {
        label: "Physical verification",
        status: "COMPLETE",
        sectionKey: "site_visit",
        result: { visitOutcome: "Property accessible", notes: "Exterior inspected." },
      },
      {
        label: "Court/crime verification",
        status: "COMPLETE",
        sectionKey: "court_crime_verification",
        result: {
          outcome: "No court or crime records found",
          notes: "Checked local records.",
        },
      },
      {
        label: "Title deeds and documentation verification",
        status: "COMPLETE",
        sectionKey: "title_deeds_verification",
        result: {
          outcome: "Title deeds verified",
          notes: "Deed of assignment confirmed.",
        },
      },
      {
        label: "Valuation verification",
        status: "COMPLETE",
        sectionKey: "valuation_verification",
        result: {
          outcome: "Valuation consistent with neighborhood",
          notes: "Market rates benchmarked.",
        },
      },
      {
        label: "Amenities and environment verification",
        status: "COMPLETE",
        sectionKey: "amenities_environment_verification",
        result: {
          outcome: "Amenities confirmed",
          notes: "Tarred access road and electricity present.",
        },
      },
    ]);

    const clientReport = await request(app)
      .get(`/api/v1/client/verification-requests/${verificationRequestId}/report/full`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(clientReport.status).toBe(200);
    expect(clientReport.body.data).toMatchObject({
      verificationTier: { code: "BASIC", name: "Basic" },
      summary: report.summary,
      findings: {
        physicalVisit: { outcome: "Property accessible", notes: "Exterior inspected." },
        titleDeedsVerification: {
          outcome: "Title deeds verified",
          notes: "Deed of assignment confirmed.",
        },
      },
    });
  }, 120000);
});
