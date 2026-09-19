import { NextFunction, Request, Response } from "express";
import { postVerificationRequest } from "../../../../../api/client/verification/handlers/post-verification-request";
import { createVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { findVerificationType } from "../../../../../api/client/verification/services/database/verification-type";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-request");
jest.mock("../../../../../api/client/verification/services/database/verification-type");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedCreateVerificationRequest = createVerificationRequest as jest.Mock;
const mockedFindVerificationType = findVerificationType as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}, userId?: string) {
  const req = {
    body,
    user: userId ? { id: userId } : undefined,
  } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("postVerificationRequest handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindVerificationType.mockResolvedValue({
      slug: "property-verification",
    });
  });

  it("returns 401 when no authenticated user is present", async () => {
    const { req, res, next } = buildMockReqRes();

    await postVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(mockedCreateVerificationRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when required property details are missing", async () => {
    const { req, res, next } = buildMockReqRes(
      { verificationTypeId: "type-1", details: { propertyType: "BUILDING" } },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedCreateVerificationRequest).not.toHaveBeenCalled();
  });

  it("creates and returns a draft verification request", async () => {
    mockedCreateVerificationRequest.mockResolvedValue({
      id: "request-1",
      status: "DRAFT",
      verificationTypeId: "type-1",
      details: {
        propertyName: "Lekki Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      additionalNote: "Inspect the foundation.",
      createdAt: new Date("2026-09-18T10:00:00.000Z"),
    });
    const { req, res, next } = buildMockReqRes(
      {
        verificationTypeId: " type-1 ",
        details: {
          propertyName: " Lekki Apartment ",
          propertyType: " COMPLETED_BUILDING ",
          propertyAddress: " 12 Admiralty Way ",
        },
        additionalNote: " Inspect the foundation. ",
      },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(mockedCreateVerificationRequest).toHaveBeenCalledWith({
      userId: "user-1",
      verificationTypeId: "type-1",
      status: "DRAFT",
      details: {
        propertyName: "Lekki Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      additionalNote: "Inspect the foundation.",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      id: "request-1",
      status: "DRAFT",
      verificationTypeId: "type-1",
      details: {
        propertyName: "Lekki Apartment",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      additionalNote: "Inspect the foundation.",
      createdAt: "2026-09-18T10:00:00.000Z",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes database failures to the error handler", async () => {
    mockedCreateVerificationRequest.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes(
      {
        verificationTypeId: "type-1",
        details: {
          propertyType: "COMPLETED_BUILDING",
          propertyAddress: "12 Admiralty Way",
        },
      },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("creates a construction verification request with construction details", async () => {
    mockedFindVerificationType.mockResolvedValue({
      id: "construction-type",
      slug: "construction-progress",
    });
    mockedCreateVerificationRequest.mockResolvedValue({
      id: "request-2",
      status: "DRAFT",
      verificationTypeId: "construction-type",
      details: {
        constructionAddress: "14 Admiralty Way",
        projectType: "3 Storey Building",
        currentConstructionStage: "Foundation Completed",
      },
      additionalNote: null,
      createdAt: new Date("2026-09-18T10:00:00.000Z"),
    });
    const { req, res, next } = buildMockReqRes(
      {
        verificationTypeId: "construction-type",
        details: {
          constructionAddress: " 14 Admiralty Way ",
          projectType: " 3 Storey Building ",
          currentConstructionStage: " Foundation Completed ",
        },
      },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(mockedCreateVerificationRequest).toHaveBeenCalledWith({
      userId: "user-1",
      verificationTypeId: "construction-type",
      status: "DRAFT",
      details: {
        constructionAddress: "14 Admiralty Way",
        projectType: "3 Storey Building",
        currentConstructionStage: "Foundation Completed",
      },
      additionalNote: null,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects incomplete construction details", async () => {
    mockedFindVerificationType.mockResolvedValue({
      id: "construction-type",
      slug: "construction-progress",
    });
    const { req, res, next } = buildMockReqRes(
      {
        verificationTypeId: "construction-type",
        details: {
          constructionAddress: "14 Admiralty Way",
          projectType: "3 Storey Building",
        },
      },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedCreateVerificationRequest).not.toHaveBeenCalled();
  });

  it("creates a business verification request with business details", async () => {
    mockedFindVerificationType.mockResolvedValue({
      id: "business-type",
      slug: "business-verification",
    });
    mockedCreateVerificationRequest.mockResolvedValue({
      id: "request-3",
      status: "DRAFT",
      verificationTypeId: "business-type",
      details: {
        businessName: "Bonafide Retail",
        businessType: "Retail Store",
        businessAddress: "20 Marina Road",
      },
      additionalNote: null,
      createdAt: new Date("2026-09-18T10:00:00.000Z"),
    });
    const { req, res, next } = buildMockReqRes(
      {
        verificationTypeId: "business-type",
        details: {
          businessName: " Bonafide Retail ",
          businessType: " Retail Store ",
          businessAddress: " 20 Marina Road ",
        },
      },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(mockedCreateVerificationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationTypeId: "business-type",
        details: {
          businessName: "Bonafide Retail",
          businessType: "Retail Store",
          businessAddress: "20 Marina Road",
        },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects incomplete business details", async () => {
    mockedFindVerificationType.mockResolvedValue({
      id: "business-type",
      slug: "business-verification",
    });
    const { req, res, next } = buildMockReqRes(
      {
        verificationTypeId: "business-type",
        details: {
          businessName: "Bonafide Retail",
          businessType: "Retail Store",
        },
      },
      "user-1",
    );

    await postVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedCreateVerificationRequest).not.toHaveBeenCalled();
  });
});
