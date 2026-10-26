import { appEvents, AppEventTypes } from "../../../events";
import { recordFailedRenewal } from "../../../api/services/database/verification-lifecycle";
import { prismaClient } from "../../../utils/prisma";
import { createFixtures } from "../../helpers/fixtures";

const fx = createFixtures("failed-renewal");
let clientId: string;

beforeAll(async () => {
  clientId = (await fx.createUser("CLIENT", "client")).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const failedEmails = (emit: jest.SpyInstance) =>
  emit.mock.calls.filter(([type]) => type === AppEventTypes.PAYMENT_FAILED);

describe("recordFailedRenewal", () => {
  it("emails on the first failure of an invoice, and fails a request waiting for payment", async () => {
    const request = await fx.createPaidRequest(clientId, "AWAITING_RENEWAL");
    const emit = jest.spyOn(appEvents, "emit");
    const failure = {
      verificationRequestId: request.id,
      providerRef: `in_fail_${fx.tag}`,
      amountInCents: 3500,
      currency: "usd",
    };

    await recordFailedRenewal(failure);
    await recordFailedRenewal(failure); // the provider retrying the same invoice

    expect(failedEmails(emit)).toEqual([
      [AppEventTypes.PAYMENT_FAILED, { verificationRequestId: request.id }],
    ]);
    emit.mockRestore();
    const saved = await prismaClient.verificationRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { transactions: { where: { providerRef: failure.providerRef } } },
    });
    expect(saved.status).toBe("PAYMENT_FAILED");
    expect(saved.transactions).toEqual([
      expect.objectContaining({ status: "FAILED", amountInCents: 3500, currency: "usd" }),
    ]);
  });

  it("still emails mid-period, but leaves work in progress alone", async () => {
    const request = await fx.createPaidRequest(clientId, "IN_PROGRESS");
    const emit = jest.spyOn(appEvents, "emit");

    await recordFailedRenewal({
      verificationRequestId: request.id,
      providerRef: `in_mid_${fx.tag}`,
      amountInCents: 3500,
      currency: "usd",
    });

    expect(failedEmails(emit)).toHaveLength(1);
    emit.mockRestore();
    const saved = await prismaClient.verificationRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(saved.status).toBe("IN_PROGRESS");
  });
});
