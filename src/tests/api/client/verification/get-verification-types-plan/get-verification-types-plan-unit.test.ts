import { NextFunction, Request, Response } from "express";
import { getVerificationTypesPlan } from "../../../../../api/client/verification/handlers/get-verification-types-plan";
import { getVerificationPlansForTypeSlug } from "../../../../../api/client/verification/services/database/verification-plan";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock(
  "../../../../../api/client/verification/services/database/verification-plan",
);
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetVerificationPlansForTypeSlug =
  getVerificationPlansForTypeSlug as jest.Mock;

function buildMockReqRes(slug = "property-verification") {
  const req = { params: { slug } } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getVerificationTypesPlan handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the plans for a verification type slug", async () => {
    mockedGetVerificationPlansForTypeSlug.mockResolvedValue([
      {
        id: "plan-1",
        frequency: "ONE_TIME",
        name: "One time verification",
        description: "A single inspection with a full report",
        priceInCents: 4500,
        currency: "NGN",
      },
      {
        id: "plan-2",
        frequency: "MONTHLY",
        name: "Monthly Update",
        description: null,
        priceInCents: 3500,
        currency: "NGN",
      },
    ]);
    const { req, res, next } = buildMockReqRes();

    await getVerificationTypesPlan(req, res, next);

    expect(mockedGetVerificationPlansForTypeSlug).toHaveBeenCalledWith(
      "property-verification",
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "plan-1",
        frequency: "ONE_TIME",
        name: "One time verification",
        description: "A single inspection with a full report",
        priceInCents: 4500,
        currency: "NGN",
      },
      {
        id: "plan-2",
        frequency: "MONTHLY",
        name: "Monthly Update",
        description: "",
        priceInCents: 3500,
        currency: "NGN",
      },
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns an empty array when the slug has no plans", async () => {
    mockedGetVerificationPlansForTypeSlug.mockResolvedValue([]);
    const { req, res, next } = buildMockReqRes("unknown-verification");

    await getVerificationTypesPlan(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes database errors to the error handler", async () => {
    mockedGetVerificationPlansForTypeSlug.mockRejectedValue(
      new Error("DB exploded"),
    );
    const { req, res, next } = buildMockReqRes();

    await getVerificationTypesPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
