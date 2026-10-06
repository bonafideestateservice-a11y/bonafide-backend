import request from "supertest";
import { VerificationStatus } from "@prisma/client";
import app from "../../../../../app";
import { generateToken } from "../../../../../utils/jwt";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
const userIds: string[] = [];
const requestIds: string[] = [];
let agentId: string;
let serviceId: string;
let verificationTypeId: string;
let planId: string;
let clientId: string;
let agentToken: string;
let adminToken: string;
let clientToken: string;

const createUser = async (role: "ADMIN" | "AGENT" | "CLIENT", label: string) => {
  const user = await prismaClient.user.create({
    data: {
      fullName: `Recurring ${label}`,
      email: `recurring-report-${label}-${suffix}@example.com`,
      role,
    },
  });
  userIds.push(user.id);
  return user;
};

const pay = (verificationRequestId: string, paidAt: string) =>
  prismaClient.transaction.create({
    data: {
      verificationRequestId,
      amountInCents: 500000,
      method: "CARD",
      status: "SUCCESS",
      paidAt: new Date(paidAt),
    },
  });

/** A monthly request in progress, with a completed checklist for its first paid period. */
const createInspectedRequest = async () => {
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId: clientId,
      verificationTypeId,
      verificationPlanId: planId,
      status: VerificationStatus.IN_PROGRESS,
      details: { propertyAddress: "Plot 7, Abuja" },
    },
  });
  requestIds.push(verificationRequest.id);
  const firstPeriod = await pay(verificationRequest.id, "2026-09-01T08:00:00Z");
  const assignment = await prismaClient.agentAssignment.create({
    data: {
      verificationRequestId: verificationRequest.id,
      agentId,
      transactionId: firstPeriod.id,
      status: "ACCEPTED",
      additionalNotes: "September inspection notes.",
    },
  });
  await prismaClient.verificationChecklistItem.create({
    data: {
      agentAssignmentId: assignment.id,
      label: "Perimeter",
      status: "COMPLETE",
      sortOrder: 0,
    },
  });
  return {
    verificationRequestId: verificationRequest.id,
    assignmentId: assignment.id,
    firstPeriod,
  };
};

const submitReport = (assignmentId: string) =>
  request(app)
    .post(`/api/v1/admin/verification/agent-assignments/${assignmentId}/report`)
    .set("Authorization", `Bearer ${agentToken}`);

const requestStatus = async (id: string) =>
  (await prismaClient.verificationRequest.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  adminToken = generateToken({ id: (await createUser("ADMIN", "admin")).id });
  const client = await createUser("CLIENT", "client");
  clientId = client.id;
  clientToken = generateToken({ id: client.id });
  const agentUser = await createUser("AGENT", "agent");
  agentToken = generateToken({ id: agentUser.id });
  agentId = (
    await prismaClient.verificationAgent.create({
      data: { userId: agentUser.id, name: "Recurring Agent" },
    })
  ).id;

  serviceId = (
    await prismaClient.service.create({
      data: { name: `Recurring Report ${suffix}`, slug: `recurring-report-${suffix}` },
    })
  ).id;
  verificationTypeId = (
    await prismaClient.verificationType.create({
      data: { serviceId, name: "Land Verification", slug: `recurring-report-type-${suffix}` },
    })
  ).id;
  planId = (
    await prismaClient.verificationPlan.create({
      data: { verificationTypeId, frequency: "MONTHLY", name: "Monthly", priceInCents: 500000 },
    })
  ).id;
});

afterAll(async () => {
  const where = { verificationRequestId: { in: requestIds } };
  await prismaClient.verificationChecklistItem.deleteMany({
    where: {
      OR: [{ report: { verificationRequestId: { in: requestIds } } }, { agentAssignment: where }],
    },
  });
  await prismaClient.verificationReport.deleteMany({ where });
  await prismaClient.agentAssignment.deleteMany({ where });
  await prismaClient.transaction.deleteMany({ where });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationPlan.delete({ where: { id: planId } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
  await prismaClient.$disconnect();
});

describe("Recurring verification report workflow", () => {
  describe("when the next period isn't paid yet", () => {
    let verificationRequestId: string;
    let assignmentId: string;
    let firstPeriodId: string;
    let reportId: string;

    beforeAll(async () => {
      const created = await createInspectedRequest();
      verificationRequestId = created.verificationRequestId;
      assignmentId = created.assignmentId;
      firstPeriodId = created.firstPeriod.id;
    });

    it("stores the report for the period and releases the assignment", async () => {
      const response = await submitReport(assignmentId);

      expect(response.status).toBe(201);
      reportId = response.body.id;

      const report = await prismaClient.verificationReport.findUniqueOrThrow({
        where: { id: reportId },
        include: { checklistItems: { select: { label: true, agentAssignmentId: true } } },
      });
      expect(report).toMatchObject({
        transactionId: firstPeriodId,
        submittedByAgentId: agentId,
        additionalNotes: "September inspection notes.",
      });
      // The checklist outlives the deleted assignment.
      expect(report.checklistItems).toEqual([{ label: "Perimeter", agentAssignmentId: null }]);
      await expect(
        prismaClient.agentAssignment.findUnique({ where: { id: assignmentId } }),
      ).resolves.toBeNull();
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.AWAITING_RENEWAL);
    });

    it("lets the admin assign the next period once the renewal is paid", async () => {
      const renewal = await pay(verificationRequestId, "2026-10-01T08:00:00Z");
      await prismaClient.verificationRequest.update({
        where: { id: verificationRequestId },
        data: { status: VerificationStatus.SUBMITTED },
      });

      const response = await request(app)
        .post(`/api/v1/admin/verification-requests/${verificationRequestId}/assign-agent`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ agentId });

      expect(response.status).toBe(201);
      const assignment = await prismaClient.agentAssignment.findUniqueOrThrow({
        where: { verificationRequestId },
      });
      expect(assignment.transactionId).toBe(renewal.id);
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.IN_PROGRESS);

      // The agent sees the payment for their own period.
      const detail = await request(app)
        .get(`/api/v1/admin/verification/agents/assignments/${assignment.id}`)
        .set("Authorization", `Bearer ${agentToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.payment).toEqual({
        status: "SUCCESS",
        amountInCents: 500000,
        currency: "NGN",
      });
    });

    it("shows the client every report, with the period it covers", async () => {
      const response = await request(app)
        .get(`/api/v1/client/verification-requests/${verificationRequestId}/reports`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        {
          id: reportId,
          generatedAt: expect.any(String),
          reviewStatus: "PENDING",
          viewed: false,
          agent: { firstName: "Recurring", lastName: "Agent" },
          payment: {
            paidAt: "2026-09-01T08:00:00.000Z",
            amountInCents: 500000,
            currency: "NGN",
          },
        },
      ]);
    });

    it("doesn't show last period's report as ready while the new period is in progress", async () => {
      const response = await request(app)
        .get(`/api/v1/client/verification-requests/${verificationRequestId}/tracking`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.timeline.reportReadyAt).toBeNull();
    });

    it("hides the report history from other users", async () => {
      const response = await request(app)
        .get(`/api/v1/client/verification-requests/${verificationRequestId}/reports`)
        .set("Authorization", `Bearer ${agentToken}`);

      expect(response.status).toBe(404);
    });
  });

  it("returns the request to SUBMITTED when the next period was paid during the inspection", async () => {
    const { verificationRequestId, assignmentId } = await createInspectedRequest();
    await pay(verificationRequestId, "2026-10-01T08:00:00Z");

    const response = await submitReport(assignmentId);

    expect(response.status).toBe(201);
    expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.SUBMITTED);
  });
});
