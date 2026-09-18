import { NextFunction, Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import { postVerificationDocuments } from "../../../../../api/client/verification/handlers/post-verification-documents";
import { createDocument } from "../../../../../api/client/verification/services/database/documents";
import { findVerificationRequest } from "../../../../../api/client/verification/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn() },
  },
}));
jest.mock("../../../../../api/client/verification/services/database/documents");
jest.mock(
  "../../../../../api/client/verification/services/database/verification-request",
);
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedCloudinaryUpload = cloudinary.uploader.upload as jest.Mock;
const mockedCreateDocument = createDocument as jest.Mock;
const mockedFindVerificationRequest = findVerificationRequest as jest.Mock;

function buildMockReqRes(userId?: string, file?: Partial<Express.Multer.File>) {
  const req = {
    params: { id: "request-1" },
    user: userId ? { id: userId } : undefined,
    file,
  } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("postVerificationDocuments handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no authenticated user is present", async () => {
    const { req, res, next } = buildMockReqRes();

    await postVerificationDocuments(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(mockedFindVerificationRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is supplied", async () => {
    const { req, res, next } = buildMockReqRes("user-1");

    await postVerificationDocuments(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedFindVerificationRequest).not.toHaveBeenCalled();
  });

  it("uploads the file and creates a document for the request owner", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
    });
    mockedCloudinaryUpload.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/example/document.pdf",
    });
    mockedCreateDocument.mockResolvedValue({
      id: "document-1",
      url: "https://res.cloudinary.com/example/document.pdf",
      fileName: "title.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 7,
    });
    const { req, res, next } = buildMockReqRes("user-1", {
      buffer: Buffer.from("pdfdata"),
      originalname: "title.pdf",
      mimetype: "application/pdf",
      size: 7,
    });

    await postVerificationDocuments(req, res, next);

    expect(mockedCloudinaryUpload).toHaveBeenCalledWith(
      expect.stringContaining("data:application/pdf;base64,"),
      {
        folder: "bonafide-services/verification-documents",
        resource_type: "raw",
      },
    );
    expect(mockedCreateDocument).toHaveBeenCalledWith({
      verificationRequestId: "request-1",
      url: "https://res.cloudinary.com/example/document.pdf",
      fileName: "title.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 7,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      id: "document-1",
      url: "https://res.cloudinary.com/example/document.pdf",
      fileName: "title.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 7,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns forbidden when the request belongs to another user", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "other-user",
    });
    const { req, res, next } = buildMockReqRes("user-1", {
      buffer: Buffer.from("image"),
      originalname: "photo.jpg",
      mimetype: "image/jpeg",
      size: 5,
    });

    await postVerificationDocuments(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.FORBIDDEN }),
    );
    expect(mockedCloudinaryUpload).not.toHaveBeenCalled();
    expect(mockedCreateDocument).not.toHaveBeenCalled();
  });

  it("forwards provider or database failures as internal errors", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
    });
    mockedCloudinaryUpload.mockRejectedValue(new Error("Cloudinary failed"));
    const { req, res, next } = buildMockReqRes("user-1", {
      buffer: Buffer.from("image"),
      originalname: "photo.jpg",
      mimetype: "image/jpeg",
      size: 5,
    });

    await postVerificationDocuments(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
