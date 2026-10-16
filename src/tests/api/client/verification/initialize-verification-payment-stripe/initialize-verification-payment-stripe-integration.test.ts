const createStripeSession = jest.fn();
jest.mock("../../../../../libs/stripe/stripe", () => ({
  ...jest.requireActual("../../../../../libs/stripe/stripe"),
  createStripeSession,
}));

import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("stripe-init");
let client: Awaited<ReturnType<typeof fx.createUser>>;
let planId: string;
let typeId: string;
const requestIds: string[] = [];

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  typeId = (await fx.createPaidRequest(client.id)).verificationTypeId;
  planId = (
    await prismaClient.verificationPlan.create({
      data: {
        verificationTypeId: typeId,
        frequency: "ONE_TIME",
        name: "One-time",
        priceInCents: 4500,
        currency: "USD",
        stripePriceId: `price_${fx.tag}`,
      },
    })
  ).id;
  createStripeSession.mockImplementation(
    async () => `https://checkout.stripe.com/c/pay/cs_${Date.now()}`,
  );
});
afterAll(async () => {
  const where = { verificationRequestId: { in: requestIds } };
  await prismaClient.transaction.deleteMany({ where });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prismaClient.verificationPlan.deleteMany({ where: { verificationTypeId: typeId } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const draftRequest = async (verificationPlanId: string | null = planId) => {
  const draft = await prismaClient.verificationRequest.create({
    data: {
      userId: client.id,
      verificationTypeId: typeId,
      verificationPlanId,
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
      expect.objectContaining({ priceId: `price_${fx.tag}`, mode: "payment" }),
    );
    const saved = await prismaClient.verificationRequest.findUniqueOrThrow({
      where: { id },
      include: { transactions: true },
    });
    expect(saved.status).toBe("PENDING_PAYMENT");
    expect(saved.transactions).toEqual([
      expect.objectContaining({
        status: "PENDING",
        amountInCents: 4500,
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

  it("returns 400 for a request without a plan or a plan not set up in Stripe", async () => {
    const noPlan = await draftRequest(null);
    expect((await pay(noPlan)).body.message).toBe("Select a verification plan before payment.");

    const unconfigured = await prismaClient.verificationPlan.create({
      data: {
        verificationTypeId: typeId,
        frequency: "MONTHLY",
        name: "Monthly",
        priceInCents: 3500,
        currency: "USD",
      },
    });
    const response = await pay(await draftRequest(unconfigured.id));
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("The selected plan is not configured in Stripe.");
  });

  it("returns 403 for another client's request, 404 for an unknown one and 401 without a token", async () => {
    const id = await draftRequest();
    const other = await fx.createUser("CLIENT", "other");
    expect((await pay(id, other.token)).status).toBe(403);
    expect((await pay("missing")).status).toBe(404);
    expect((await pay(id, null)).status).toBe(401);
  });
});
