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
});
