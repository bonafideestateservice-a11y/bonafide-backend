const transaction = {
  agentAssignment: { findFirst: jest.fn() },
};
const prisma = {
  $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
};

jest.mock("../../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { submitAgentAssignmentReport } from "../../../../../api/admin/verification/services/database/verification-report";

describe("submitAgentAssignmentReport (service)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not submit a period report until every required site visit is complete", async () => {
    transaction.agentAssignment.findFirst.mockResolvedValue({
      id: "assignment-1",
      verificationRequestId: "request-1",
      transactionId: "transaction-1",
      additionalNotes: null,
      transaction: {
        subscriptionPeriod: {
          id: "period-1",
          periodStart: new Date("2026-11-01T00:00:00.000Z"),
          periodEnd: new Date("2026-12-01T00:00:00.000Z"),
          requiredSiteVisits: 2,
          completedSiteVisits: 1,
        },
      },
      checklistItems: [],
      verificationRequest: {
        verificationTierId: "tier-standard",
        verificationTier: { id: "tier-standard", name: "Standard", code: "STANDARD" },
        monitoringPlanId: "plan-monthly",
        monitoringPlan: { id: "plan-monthly", name: "Monthly", code: "MONTHLY" },
        recurringConsent: true,
      },
    });

    await expect(
      submitAgentAssignmentReport("agent-1", "assignment-1", {
        url: "https://cdn.example.com/report.pdf",
        fileName: "report.pdf",
        fileType: "application/pdf",
        fileSizeBytes: 123,
      }),
    ).resolves.toEqual({
      kind: "INCOMPLETE_SITE_VISITS",
      progressPercent: 50,
      remainingSiteVisits: 1,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 20000,
    });
    expect(transaction.agentAssignment.findFirst).toHaveBeenCalled();
    expect(transaction.agentAssignment.findFirst).toHaveBeenCalledTimes(1);
  });
});
