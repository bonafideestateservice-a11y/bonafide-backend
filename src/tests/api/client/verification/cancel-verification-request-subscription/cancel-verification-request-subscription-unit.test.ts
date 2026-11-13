const database = {
  findSubscriptionForCancellation: jest.fn(),
  markPaystackSubscriptionDisabled: jest.fn(),
  markStripeSubscriptionInactive: jest.fn(),
};

jest.mock(
  "../../../../../api/client/verification/services/database/subscription-cancellation",
  () => database,
);
jest.mock("../../../../../libs/paystack/paystack", () => ({
  cancelPaystackSubscription: jest.fn(),
}));
jest.mock("../../../../../libs/stripe/stripe", () => ({
  cancelStripeSubscription: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../../../api/services/database/verification-lifecycle", () => ({
  announceSubscriptionEnded: jest.fn(),
  completeRequestIfFinished: jest.fn(),
}));

import { cancelVerificationRequestSubscription } from "../../../../../api/client/verification/handlers/cancel-verification-request-subscription";
import {
  announceSubscriptionEnded,
  completeRequestIfFinished,
} from "../../../../../api/services/database/verification-lifecycle";
import {
  findSubscriptionForCancellation,
  markPaystackSubscriptionDisabled,
  markStripeSubscriptionInactive,
} from "../../../../../api/client/verification/services/database/subscription-cancellation";
import { cancelPaystackSubscription } from "../../../../../libs/paystack/paystack";
import { cancelStripeSubscription } from "../../../../../libs/stripe/stripe";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mockedFind = findSubscriptionForCancellation as jest.Mock;
const mockedMark = markPaystackSubscriptionDisabled as jest.Mock;
const mockedMarkStripe = markStripeSubscriptionInactive as jest.Mock;
const mockedCancel = cancelPaystackSubscription as jest.Mock;
const mockedCancelStripe = cancelStripeSubscription as jest.Mock;

const call = (user: object | null = { id: "u1" }) =>
  callHandler(cancelVerificationRequestSubscription, {
    params: { id: "r1" },
    user: user ?? undefined,
  });

describe("cancelVerificationRequestSubscription (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [
        {
          id: "ms1",
          provider: "PAYSTACK",
          providerSubscriptionId: "SUB_1",
          emailToken: "TOKEN_1",
          status: "ACTIVE",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      legacyPaystackSubscription: null,
      legacyStripeSubscription: null,
    });
    mockedCancel.mockResolvedValue(undefined);
    mockedCancelStripe.mockResolvedValue(undefined);
    mockedMark.mockResolvedValue(true);
    mockedMarkStripe.mockResolvedValue(true);
  });

  it("cancels the owned Paystack subscription and updates local status after provider confirmation", async () => {
    const { res } = await call();

    expect(mockedFind).toHaveBeenCalledWith("r1", "u1");
    expect(mockedCancel).toHaveBeenCalledWith("SUB_1", "TOKEN_1");
    expect(mockedMark).toHaveBeenCalledWith({
      verificationRequestId: "r1",
      providerSubscriptionId: "SUB_1",
      monitoringSubscriptionId: "ms1",
    });
    expect(completeRequestIfFinished).toHaveBeenCalledWith(expect.anything(), "r1");
    expect(announceSubscriptionEnded).toHaveBeenCalledWith("r1");
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Subscription cancelled successfully.",
      data: { provider: "PAYSTACK", subscriptionStatus: "DISABLED" },
    });
  });

  it("returns not found for a request that does not belong to the authenticated user", async () => {
    mockedFind.mockResolvedValue(null);
    const { next } = await call();

    expect(errorStatus(next)).toBe(404);
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it("does not call Paystack again when the subscription is already stopped", async () => {
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [
        {
          id: "ms1",
          provider: "PAYSTACK",
          providerSubscriptionId: "SUB_1",
          emailToken: "TOKEN_1",
          status: "NON_RENEWING",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      legacyPaystackSubscription: null,
      legacyStripeSubscription: null,
    });
    const { res } = await call();

    expect(mockedCancel).not.toHaveBeenCalled();
    expect(mockedMark).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { provider: "PAYSTACK", subscriptionStatus: "NON_RENEWING" },
      }),
    );
  });

  it("cancels the legacy Paystack subscription when no monitoring record exists", async () => {
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [],
      legacyPaystackSubscription: {
        subscriptionCode: "SUB_legacy",
        emailToken: "TOKEN_legacy",
        status: "ACTIVE",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      legacyStripeSubscription: null,
    });

    await call();

    expect(mockedCancel).toHaveBeenCalledWith("SUB_legacy", "TOKEN_legacy");
    expect(mockedMark).toHaveBeenCalledWith({
      verificationRequestId: "r1",
      providerSubscriptionId: "SUB_legacy",
    });
  });

  it("does not change local state when Paystack rejects the cancellation", async () => {
    mockedCancel.mockRejectedValue(new Error("Paystack cancellation failed (403)"));
    const { next } = await call();

    expect(errorStatus(next)).toBe(500);
    expect(mockedMark).not.toHaveBeenCalled();
  });

  it("returns a conflict when the request has no Paystack subscription", async () => {
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [],
      legacyPaystackSubscription: null,
      legacyStripeSubscription: null,
    });
    const { next } = await call();

    expect(errorStatus(next)).toBe(409);
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it("cancels the owned Stripe monitoring subscription and updates it after provider confirmation", async () => {
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [
        {
          id: "ms_stripe",
          provider: "STRIPE",
          providerSubscriptionId: "sub_stripe",
          emailToken: null,
          status: "ACTIVE",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      legacyPaystackSubscription: null,
      legacyStripeSubscription: null,
    });

    const { res } = await call();

    expect(mockedCancelStripe).toHaveBeenCalledWith("sub_stripe");
    expect(mockedCancel).not.toHaveBeenCalled();
    expect(mockedMarkStripe).toHaveBeenCalledWith({
      verificationRequestId: "r1",
      providerSubscriptionId: "sub_stripe",
      monitoringSubscriptionId: "ms_stripe",
    });
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Subscription cancelled successfully.",
      data: { provider: "STRIPE", subscriptionStatus: "DISABLED" },
    });
  });

  it("cancels the legacy Stripe subscription when no monitoring record exists", async () => {
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [],
      legacyPaystackSubscription: null,
      legacyStripeSubscription: {
        subscriptionId: "sub_legacy",
        status: "ACTIVE",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });

    const { res } = await call();

    expect(mockedCancelStripe).toHaveBeenCalledWith("sub_legacy");
    expect(mockedMarkStripe).toHaveBeenCalledWith({
      verificationRequestId: "r1",
      providerSubscriptionId: "sub_legacy",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { provider: "STRIPE", subscriptionStatus: "INACTIVE" },
      }),
    );
  });

  it("does not change local state when Stripe rejects the cancellation", async () => {
    mockedFind.mockResolvedValue({
      monitoringSubscriptions: [
        {
          id: "ms_stripe",
          provider: "STRIPE",
          providerSubscriptionId: "sub_stripe",
          emailToken: null,
          status: "ACTIVE",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      legacyPaystackSubscription: null,
      legacyStripeSubscription: null,
    });
    mockedCancelStripe.mockRejectedValue(new Error("Stripe cancellation failed"));

    const { next } = await call();

    expect(errorStatus(next)).toBe(500);
    expect(mockedMarkStripe).not.toHaveBeenCalled();
  });
});
