jest.mock("../../utils/prisma", () => ({ prismaClient: {} }));

import { VerificationStatus } from "@prisma/client";
import {
  completeRequestIfFinished,
  markRequestPaid,
  markRequestPaymentFailed,
  nextStatusAfterRecurringReport,
} from "../../api/services/database/verification-lifecycle";

const buildDb = ({
  unreportedPaidPeriod = false,
  paystackStatus,
  stripeStatus,
}: {
  unreportedPaidPeriod?: boolean;
  paystackStatus?: string;
  stripeStatus?: string;
} = {}) => ({
  transaction: {
    findFirst: jest.fn().mockResolvedValue(unreportedPaidPeriod ? { id: "txn-2" } : null),
  },
  verificationRequest: {
    findUnique: jest.fn().mockResolvedValue({
      paystackSubscription: paystackStatus ? { status: paystackStatus } : null,
      stripeSubscription: stripeStatus ? { status: stripeStatus } : null,
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

type Db = Parameters<typeof markRequestPaid>[0];
const asDb = (db: ReturnType<typeof buildDb>) => db as unknown as Db;

describe("verification lifecycle rules", () => {
  describe("nextStatusAfterRecurringReport", () => {
    it("returns SUBMITTED when the next period is already paid", async () => {
      const db = buildDb({ unreportedPaidPeriod: true, paystackStatus: "DISABLED" });

      await expect(nextStatusAfterRecurringReport(asDb(db), "vr-1")).resolves.toBe(
        VerificationStatus.SUBMITTED,
      );
    });

    it.each([
      ["a disabled Paystack subscription", { paystackStatus: "DISABLED" }],
      ["a non-renewing Paystack subscription", { paystackStatus: "NON_RENEWING" }],
      ["an inactive Stripe subscription", { stripeStatus: "INACTIVE" }],
    ])("returns COMPLETED for %s", async (_label, options) => {
      await expect(nextStatusAfterRecurringReport(asDb(buildDb(options)), "vr-1")).resolves.toBe(
        VerificationStatus.COMPLETED,
      );
    });

    it.each([
      ["an active Paystack subscription", { paystackStatus: "ACTIVE" }],
      ["a Paystack subscription with a failed payment", { paystackStatus: "PAYMENT_FAILED" }],
      ["an active Stripe subscription", { stripeStatus: "ACTIVE" }],
    ])("returns AWAITING_RENEWAL for %s", async (_label, options) => {
      await expect(nextStatusAfterRecurringReport(asDb(buildDb(options)), "vr-1")).resolves.toBe(
        VerificationStatus.AWAITING_RENEWAL,
      );
    });

    it("looks for the oldest paid period that has no report", async () => {
      const db = buildDb();

      await nextStatusAfterRecurringReport(asDb(db), "vr-1");

      expect(db.transaction.findFirst).toHaveBeenCalledWith({
        where: { verificationRequestId: "vr-1", status: "SUCCESS", report: null },
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
    });
  });

  it("markRequestPaid never moves a request that is in progress", async () => {
    const db = buildDb();

    await markRequestPaid(asDb(db), "vr-1");

    expect(db.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "vr-1",
        status: {
          in: [
            VerificationStatus.DRAFT,
            VerificationStatus.PENDING_PAYMENT,
            VerificationStatus.PAYMENT_FAILED,
            VerificationStatus.AWAITING_RENEWAL,
          ],
        },
      },
      data: { status: VerificationStatus.SUBMITTED },
    });
  });

  it("markRequestPaymentFailed only affects requests with a payment due", async () => {
    const db = buildDb();

    await markRequestPaymentFailed(asDb(db), "vr-1");

    expect(db.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "vr-1",
        status: { in: [VerificationStatus.PENDING_PAYMENT, VerificationStatus.AWAITING_RENEWAL] },
      },
      data: { status: VerificationStatus.PAYMENT_FAILED },
    });
  });

  describe("completeRequestIfFinished", () => {
    it("leaves the request alone while a paid period still needs an inspection", async () => {
      const db = buildDb({ unreportedPaidPeriod: true });

      await expect(completeRequestIfFinished(asDb(db), "vr-1")).resolves.toEqual({ count: 0 });
      expect(db.verificationRequest.updateMany).not.toHaveBeenCalled();
    });

    it("completes a request that is waiting between periods and has reports", async () => {
      const db = buildDb();

      await completeRequestIfFinished(asDb(db), "vr-1");

      expect(db.verificationRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: "vr-1",
          status: {
            in: [VerificationStatus.AWAITING_RENEWAL, VerificationStatus.PAYMENT_FAILED],
          },
          reports: { some: {} },
        },
        data: { status: VerificationStatus.COMPLETED },
      });
    });
  });
});
