const prisma = {
  verificationRequest: { findFirst: jest.fn() },
};
const mockCreatePremiumQuoteRequest = jest.fn();

jest.mock("../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("../../../../api/services/database/pricing", () => ({
  createPremiumQuoteRequest: (...args: unknown[]) => mockCreatePremiumQuoteRequest(...args),
}));

import { postVerificationRequestQuote } from "../../../../api/client/verification/handlers/post-verification-request-quote";
import { callHandler } from "../../../helpers/http";

describe("postVerificationRequestQuote handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.verificationRequest.findFirst.mockResolvedValue({
      id: "request-1",
      verificationTierId: "tier-premium",
      intendedUse: null,
      verificationTier: { code: "PREMIUM" },
    });
    mockCreatePremiumQuoteRequest.mockResolvedValue({
      id: "quote-1",
      verificationRequestId: "request-1",
      status: "REQUESTED",
      createdAt: new Date("2026-11-11T12:00:00.000Z"),
    });
  });

  it("saves intended use and client notes when requesting a Premium quote", async () => {
    const { res, next } = await callHandler(postVerificationRequestQuote, {
      params: { id: "request-1" },
      body: {
        intendedUse: " Residential rental investment ",
        notes: " Include a valuation of the existing structure. ",
      },
      user: { id: "client-1" },
    });

    expect(mockCreatePremiumQuoteRequest).toHaveBeenCalledWith({
      verificationRequestId: "request-1",
      verificationTierId: "tier-premium",
      userId: "client-1",
      intendedUse: "Residential rental investment",
      notes: "Include a valuation of the existing structure.",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: "quote-1", status: "REQUESTED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("uses intended use already saved on the request", async () => {
    prisma.verificationRequest.findFirst.mockResolvedValue({
      id: "request-1",
      verificationTierId: "tier-premium",
      intendedUse: "Long-term residential rental",
      verificationTier: { code: "PREMIUM" },
    });

    await callHandler(postVerificationRequestQuote, {
      params: { id: "request-1" },
      body: {},
      user: { id: "client-1" },
    });

    expect(mockCreatePremiumQuoteRequest).toHaveBeenCalledWith({
      verificationRequestId: "request-1",
      verificationTierId: "tier-premium",
      userId: "client-1",
      intendedUse: "Long-term residential rental",
    });
  });

  it("requires intended use for the Premium feasibility report", async () => {
    const { next } = await callHandler(postVerificationRequestQuote, {
      params: { id: "request-1" },
      body: { notes: "Please call before visiting." },
      user: { id: "client-1" },
    });

    expect(mockCreatePremiumQuoteRequest).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
