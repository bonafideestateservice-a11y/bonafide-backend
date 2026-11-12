const createStripeSession = jest.fn();
jest.mock("../../../../../libs/stripe/stripe", () => ({
  ...jest.requireActual("../../../../../libs/stripe/stripe"),
  createStripeSession,
}));

import { VerificationTierCode } from "@prisma/client";
import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("stripe-init");
let client: Awaited<ReturnType<typeof fx.createUser>>;
let typeId: string;
let tierId: string;
let tierPriceUsdCents: number;
let stripePriceId: string;
let createdPriceVersionId: string | undefined;
let createdTier = false;
const requestIds: string[] = [];

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  typeId = (await fx.createPaidRequest(client.id)).verificationTypeId;

  const existingTier = await prismaClient.verificationTier.findUnique({
    where: { code: VerificationTierCode.BASIC },
  });
  const tier =
    existingTier ??
    (await prismaClient.verificationTier.create({
      data: {
        code: VerificationTierCode.BASIC,
        name: "Basic",
        description: "Stripe integration-test tier",
        priceUsdCents: 4500,
      },
    }));
  tierId = tier.id;
  tierPriceUsdCents = tier.priceUsdCents ?? 4500;
  createdTier = !existingTier;

  const existingPriceVersion = await prismaClient.providerPriceVersion.findFirst({
    where: {
      verificationTierId: tierId,
      provider: "STRIPE",
      currency: "USD",
      syncStatus: "READY",
      activeForNewCheckout: true,
    },
    select: { providerPriceId: true, usdAmountCents: true, amountMinor: true },
  });
  if (
    existingPriceVersion?.providerPriceId &&
    existingPriceVersion.usdAmountCents === tierPriceUsdCents &&
    existingPriceVersion.amountMinor === tierPriceUsdCents
  ) {
    stripePriceId = existingPriceVersion.providerPriceId;
  } else {
    const activePriceVersion = await prismaClient.providerPriceVersion.findFirst({
      where: {
        verificationTierId: tierId,
        provider: "STRIPE",
        currency: "USD",
        activeForNewCheckout: true,
      },
    });
    if (activePriceVersion) {
      throw new Error("The active Stripe price does not match the Basic tier price.");
    }
    const latestPriceVersion = await prismaClient.providerPriceVersion.findFirst({
      where: { verificationTierId: tierId, provider: "STRIPE" },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const priceVersion = await prismaClient.providerPriceVersion.create({
      data: {
        verificationTierId: tierId,
        provider: "STRIPE",
        currency: "USD",
        amountMinor: tierPriceUsdCents,
        usdAmountCents: tierPriceUsdCents,
        version: (latestPriceVersion?.version ?? 0) + 1,
        syncStatus: "READY",
        activeForNewCheckout: true,
        providerPriceId: `price_${fx.tag}`,
      },
      select: { id: true, providerPriceId: true },
    });
    createdPriceVersionId = priceVersion.id;
    if (!priceVersion.providerPriceId) {
      throw new Error("Stripe provider price was not created for the integration test.");
    }
    stripePriceId = priceVersion.providerPriceId;
  }

  createStripeSession.mockImplementation(async () => ({
    id: `cs_${Date.now()}`,
    url: `https://checkout.stripe.com/c/pay/cs_${Date.now()}`,
  }));
});
afterAll(async () => {
  const where = { verificationRequestId: { in: requestIds } };
  await prismaClient.transaction.deleteMany({ where });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  if (createdPriceVersionId) {
    await prismaClient.providerPriceVersion.delete({ where: { id: createdPriceVersionId } });
  }
  if (createdTier) await prismaClient.verificationTier.delete({ where: { id: tierId } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const draftRequest = async (verificationTierId: string | null = tierId, userId = client.id) => {
  const draft = await prismaClient.verificationRequest.create({
    data: {
      userId,
      verificationTypeId: typeId,
      verificationTierId,
      status: "DRAFT",
      details: { propertyType: "HOUSE", propertyAddress: "Lekki, Lagos" },
    },
  });
  requestIds.push(draft.id);
  return draft.id;
};

const pay = (id: string, token: string | null = client.token) => {
  const call = request(app).post(
    `/api/v1/client/verification-requests/${id}/payment/initialize-stripe`,
  );
  return token ? call.set("Authorization", `Bearer ${token}`) : call;
};

describe("POST /api/v1/client/verification-requests/:id/payment/initialize-stripe", () => {
  it("starts a Stripe checkout, reserves the payment and reuses the open checkout", async () => {
    const id = await draftRequest();
    const before = createStripeSession.mock.calls.length;

    const first = await pay(id);
    const again = await pay(id);

    expect(first.status).toBe(200);
    expect(first.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(again.body).toEqual(first.body);
    expect(createStripeSession.mock.calls.length - before).toBe(1);
    expect(createStripeSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lineItems: [{ price: stripePriceId, quantity: 1 }],
        mode: "payment",
      }),
    );
    const saved = await prismaClient.verificationRequest.findUniqueOrThrow({
      where: { id },
      include: { transactions: true },
    });
    expect(saved.status).toBe("PENDING_PAYMENT");
    expect(saved.transactions).toEqual([
      expect.objectContaining({
        status: "PENDING",
        amountInCents: tierPriceUsdCents,
        currency: "USD",
        authorizationUrl: first.body.url,
      }),
    ]);
  });

  it("marks the payment FAILED when Stripe fails, and a retry starts again", async () => {
    const id = await draftRequest();
    createStripeSession.mockRejectedValueOnce(new Error("stripe down"));

    const failed = await pay(id);
    expect(failed.status).toBe(500);
    expect(failed.body.message).toBe("Unable to initialize payment.");
    const transaction = await prismaClient.transaction.findFirstOrThrow({
      where: { verificationRequestId: id },
    });
    expect(transaction.status).toBe("FAILED");

    const retry = await pay(id);
    expect(retry.status).toBe(200);
  });

  it("returns 400 when no tier is selected or Stripe is not the client's provider", async () => {
    const noTier = await draftRequest(null);
    expect((await pay(noTier)).body.message).toBe("Verification tier is unavailable");

    const nigerianClient = await fx.createUser("CLIENT", "nigerian-client", "NG");
    const nigerianRequest = await draftRequest(tierId, nigerianClient.id);
    const response = await pay(nigerianRequest, nigerianClient.token);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Payment provider does not match the request country");
  });

  it("returns 403 for another client's request, 404 for an unknown one and 401 without a token", async () => {
    const id = await draftRequest();
    const other = await fx.createUser("CLIENT", "other");
    expect((await pay(id, other.token)).status).toBe(403);
    expect((await pay("missing")).status).toBe(404);
    expect((await pay(id, null)).status).toBe(401);
  });
});
