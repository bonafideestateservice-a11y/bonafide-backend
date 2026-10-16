const prisma = { transaction: { findFirst: jest.fn() } };
jest.mock("../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { Request, Response } from "express";
import { callback_url } from "../../../../api/webhooks/paystack";

const call = async (query: Record<string, string>) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await callback_url({ query } as unknown as Request, res as unknown as Response);
  return res;
};

describe("Paystack callback (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reports the payment's status by its reference", async () => {
    prisma.transaction.findFirst.mockResolvedValue({ status: "SUCCESS" });
    const res = await call({ reference: "ref_1" });
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({ where: { providerRef: "ref_1" } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Payment received. Webhook processing will update the verification request.",
      reference: "ref_1",
      status: "SUCCESS",
    });
  });

  it("returns 400 without a reference and 404 for an unknown one", async () => {
    expect((await call({})).status).toHaveBeenCalledWith(400);
    prisma.transaction.findFirst.mockResolvedValue(null);
    expect((await call({ reference: "nope" })).status).toHaveBeenCalledWith(404);
  });
});
