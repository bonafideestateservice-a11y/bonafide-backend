import {
  PaymentStatus,
  PaystackSubscriptionStatus,
  Prisma,
  StripeSubscriptionStatus,
  VERIFICATION_FREQUENCY,
  VerificationStatus,
} from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";

/**
 * Status rules shared by the payment webhooks, agent assignment and report submission.
 * See docs/recurring-verifications-plan.md for the full lifecycle.
 *
 * A "paid period" is a successful transaction. It is reported once a report points at it
 * (VerificationReport.transactionId).
*/

type Db = Prisma.TransactionClient | typeof prismaClient;

/** Statuses a successful payment may move to SUBMITTED. Never IN_PROGRESS: that work is paid. */
export const PAYABLE_STATUSES: VerificationStatus[] = [
  VerificationStatus.DRAFT,
  VerificationStatus.PENDING_PAYMENT,
  VerificationStatus.PAYMENT_FAILED,
  VerificationStatus.AWAITING_RENEWAL,
];

/** Statuses a failed payment may move to PAYMENT_FAILED. */
export const PAYMENT_DUE_STATUSES: VerificationStatus[] = [
  VerificationStatus.PENDING_PAYMENT,
  VerificationStatus.AWAITING_RENEWAL,
];

const ENDED_PAYSTACK_STATUSES: PaystackSubscriptionStatus[] = [
  PaystackSubscriptionStatus.NON_RENEWING,
  PaystackSubscriptionStatus.DISABLED,
  PaystackSubscriptionStatus.EXPIRED,
];

/** The oldest paid period with no report yet, or null. */
export const findUnreportedPaidTransaction = (db: Db, verificationRequestId: string) =>
  db.transaction.findFirst({
    where: { verificationRequestId, status: PaymentStatus.SUCCESS, report: null },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

export const isRecurringRequest = async (db: Db, verificationRequestId: string) => {
  const request = await db.verificationRequest.findUnique({
    where: { id: verificationRequestId },
    select: { verificationPlan: { select: { frequency: true } } },
  });
  const frequency = request?.verificationPlan?.frequency;
  return !!frequency && frequency !== VERIFICATION_FREQUENCY.ONE_TIME;
};

/** True when no further renewals will be charged. */
export const hasSubscriptionEnded = async (db: Db, verificationRequestId: string) => {
  const request = await db.verificationRequest.findUnique({
    where: { id: verificationRequestId },
    select: {
      paystackSubscription: { select: { status: true } },
      stripeSubscription: { select: { status: true } },
    },
  });
  if (!request) return false;

  const { paystackSubscription, stripeSubscription } = request;
  if (paystackSubscription) return ENDED_PAYSTACK_STATUSES.includes(paystackSubscription.status);
  if (stripeSubscription) return stripeSubscription.status === StripeSubscriptionStatus.INACTIVE;
  return false;
};

/** Where a recurring request goes once its current period is reported. */
export const nextStatusAfterRecurringReport = async (
  db: Db,
  verificationRequestId: string,
): Promise<VerificationStatus> => {
  if (await findUnreportedPaidTransaction(db, verificationRequestId)) {
    return VerificationStatus.SUBMITTED;
  }
  if (await hasSubscriptionEnded(db, verificationRequestId)) {
    return VerificationStatus.COMPLETED;
  }
  return VerificationStatus.AWAITING_RENEWAL;
};

/** A payment succeeded: the request needs an agent, unless one is already working. */
export const markRequestPaid = (db: Db, verificationRequestId: string) =>
  db.verificationRequest.updateMany({
    where: { id: verificationRequestId, status: { in: PAYABLE_STATUSES } },
    data: { status: VerificationStatus.SUBMITTED },
  });

/** A due payment failed. Requests already being worked on are left alone. */
export const markRequestPaymentFailed = (db: Db, verificationRequestId: string) =>
  db.verificationRequest.updateMany({
    where: { id: verificationRequestId, status: { in: PAYMENT_DUE_STATUSES } },
    data: { status: VerificationStatus.PAYMENT_FAILED },
  });

/**
 * The subscription ended: complete the request if every paid period is reported. Requests
 * still in progress are completed by report submission instead.
*/

export const completeRequestIfFinished = async (db: Db, verificationRequestId: string) => {
  if (await findUnreportedPaidTransaction(db, verificationRequestId)) return { count: 0 };

  return db.verificationRequest.updateMany({
    where: {
      id: verificationRequestId,
      status: { in: [VerificationStatus.AWAITING_RENEWAL, VerificationStatus.PAYMENT_FAILED] },
      reports: { some: {} },
    },
    data: { status: VerificationStatus.COMPLETED },
  });
};
