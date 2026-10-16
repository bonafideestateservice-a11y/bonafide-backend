jest.mock("../../../../../libs/paystack/paystack", () => ({
  ...jest.requireActual("../../../../../libs/paystack/paystack"),
  createPaystackCustomer: jest.fn(async () => ({ customer_code: `CUS_test_${Date.now()}` })),
  createPaystackSession: jest.fn(async () => ({
    reference: `ref_${Date.now()}`,
    authorization_url: "https://checkout.paystack.com/test",
    access_code: "access_test",
  })),
}));

import request from "supertest";
import app from "../../../../../app";
import { createPaystackSession } from "../../../../../libs/paystack/paystack";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("paystack-init");
const env = { ...process.env };
let client: Awaited<ReturnType<typeof fx.createUser>>;
let planId: string;
const requestIds: string[] = [];

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  // A paid request gives us the fixture's verification type to hang a USD plan on.
  const { verificationTypeId } = await fx.createPaidRequest(client.id);
  planId = (
    await prismaClient.verificationPlan.create({
      data: {
        verificationTypeId,
        frequency: "ONE_TIME",
        name: "One-time",
        priceInCents: 3500,
        currency: "USD",
      },
    })
  ).id;
});
afterEach(() => {
  process.env = { ...env };
});
afterAll(async () => {
  const where = { verificationRequestId: { in: requestIds } };
  await prismaClient.transaction.deleteMany({ where });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prismaClient.verificationPlan.delete({ where: { id: planId } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const startPayment = async () => {
  const draft = await prismaClient.verificationRequest.create({
    data: {
      userId: client.id,
      verificationTypeId: (
        await prismaClient.verificationPlan.findUniqueOrThrow({
          where: { id: planId },
        })
      ).verificationTypeId,
      verificationPlanId: planId,
      status: "DRAFT",
      details: { propertyType: "HOUSE", propertyAddress: "Lekki, Lagos" },
    },
  });
  requestIds.push(draft.id);
  const response = await request(app)
    .post(`/api/v1/client/verification-requests/${draft.id}/payment/initialize-paystack`)
    .set("Authorization", `Bearer ${client.token}`);
  const transaction = await prismaClient.transaction.findFirst({
    where: { verificationRequestId: draft.id },
  });
  return { response, transaction };
};

/** A draft request on the plan, owned by the test client. */
const draftRequest = async () => {
  const plan = await prismaClient.verificationPlan.findUniqueOrThrow({ where: { id: planId } });
  const draft = await prismaClient.verificationRequest.create({
    data: {
      userId: client.id,
      verificationTypeId: plan.verificationTypeId,
      verificationPlanId: planId,
      status: "DRAFT",
      details: { propertyType: "HOUSE", propertyAddress: "Lekki, Lagos" },
    },
  });
  requestIds.push(draft.id);
  return draft.id;
};

const pay = (id: string, token: string | null = client.token, key?: string) => {
  const call = request(app).post(
    `/api/v1/client/verification-requests/${id}/payment/initialize-paystack`,
  );
  if (token) call.set("Authorization", `Bearer ${token}`);
  if (key) call.set("Idempotency-Key", key);
  return call;
};

describe("POST /api/v1/client/verification-requests/:id/payment/initialize-paystack", () => {
  it("charges a USD plan in naira in test mode", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
    process.env.PAYSTACK_TEST_USD_TO_NGN_RATE = "1600";

    const { response, transaction } = await startPayment();

    expect(response.status).toBe(200);
    expect(response.body.authorization_url).toBe("https://checkout.paystack.com/test");
    expect(createPaystackSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 5600000, currency: "NGN" }),
    );
    expect(transaction).toMatchObject({ amountInCents: 5600000, currency: "NGN" });
  });

  it("charges the plan's own USD price with a live key", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_abc";
    process.env.PAYSTACK_TEST_USD_TO_NGN_RATE = "1600";

    const { response, transaction } = await startPayment();

    expect(response.status).toBe(200);
    expect(createPaystackSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 3500, currency: "USD" }),
    );
    expect(transaction).toMatchObject({ amountInCents: 3500, currency: "USD" });
  });

  it("saves the Paystack customer, marks the request PENDING_PAYMENT and reuses the open checkout", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_abc";
    const id = await draftRequest();
    const sessionsBefore = (createPaystackSession as jest.Mock).mock.calls.length;

    const first = await pay(id);
    const again = await pay(id);

    expect(first.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect((createPaystackSession as jest.Mock).mock.calls.length - sessionsBefore).toBe(1);
    const saved = await prismaClient.verificationRequest.findUniqueOrThrow({
      where: { id },
      include: { user: true, transactions: true },
    });
    expect(saved.status).toBe("PENDING_PAYMENT");
    expect(saved.user.paystackCustomerCode).toMatch(/^CUS_test_/);
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0]).toMatchObject({
      status: "PENDING",
      providerRef: first.body.reference,
      authorizationUrl: first.body.authorization_url,
    });
  });

  it("returns 409 once the request has been paid", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_abc";
    const id = await draftRequest();
    await pay(id);
    await prismaClient.transaction.updateMany({
      where: { verificationRequestId: id },
      data: { status: "SUCCESS", paidAt: new Date() },
    });
    await prismaClient.verificationRequest.update({ where: { id }, data: { status: "SUBMITTED" } });

    const response = await pay(id);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("This verification request is not available for payment.");
  });

  it("replays a repeated Idempotency-Key", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_abc";
    const id = await draftRequest();
    const key = `verify-pay-${fx.tag}`;

    const first = await pay(id, client.token, key);
    const replay = await pay(id, client.token, key);

    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body).toEqual(first.body);
    await prismaClient.idempotencyKey.deleteMany({ where: { userId: client.id } });
  });

  it("returns 403 for another client's request, 404 for an unknown one and 401 without a token", async () => {
    const id = await draftRequest();
    const other = await fx.createUser("CLIENT", "other");
    expect((await pay(id, other.token)).status).toBe(403);
    expect((await pay("missing")).status).toBe(404);
    expect((await pay(id, null)).status).toBe(401);
  });
});
