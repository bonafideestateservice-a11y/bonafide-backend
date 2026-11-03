import { NextFunction, Request, Response } from "express";
import { submitAgentReport } from "../../../../../api/admin/verification/handlers/submit-agent-report";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { submitAgentAssignmentReport } from "../../../../../api/admin/verification/services/database/verification-report";
import { HttpStatusCode } from "../../../../../exceptions";
import { v2 as cloudinary } from "cloudinary";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/verification-report");
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn(), destroy: jest.fn() },
  },
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedSubmit = submitAgentAssignmentReport as jest.Mock;
const mockedUpload = cloudinary.uploader.upload as jest.Mock;
const mockedDestroy = cloudinary.uploader.destroy as jest.Mock;

function buildMockReqRes(userId?: string, includeFile = true) {
  const req = {
    user: userId ? { id: userId } : undefined,
    params: { id: "assignment-1" },
    ...(includeFile
      ? {
          file: {
            buffer: Buffer.from("%PDF-1.4 test report"),
            originalname: "report.pdf",
            mimetype: "application/pdf",
            size: 20,
          },
        }
      : {}),
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("submitAgentReport handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUpload.mockResolvedValue({
      public_id: "report-document-1",
      secure_url: "https://cdn.test/report.pdf",
    });
  });

  it("returns 409 with remaining checklist items", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedSubmit.mockResolvedValue({
      kind: "INCOMPLETE_CHECKLIST",
      progressPercent: 50,
      remainingItems: ["Survey plan"],
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await submitAgentReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
      error: "INCOMPLETE_CHECKLIST",
      progressPercent: 50,
      remainingItems: ["Survey plan"],
    });
    expect(mockedDestroy).toHaveBeenCalledWith("report-document-1", { resource_type: "raw" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 201 with the submitted report", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedSubmit.mockResolvedValue({
      kind: "SUBMITTED",
      id: "report-1",
      reviewStatus: "APPROVED",
      generatedAt: new Date("2026-09-19T18:00:00.000Z"),
      reportDocument: {
        id: "document-1",
        url: "https://cdn.test/report.pdf",
        fileName: "report.pdf",
        fileType: "application/pdf",
        fileSizeBytes: 20,
      },
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await submitAgentReport(req, res, next);

    expect(mockedSubmit).toHaveBeenCalledWith("agent-1", "assignment-1", {
      url: "https://cdn.test/report.pdf",
      fileName: "report.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 20,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      id: "report-1",
      reviewStatus: "APPROVED",
      generatedAt: "2026-09-19T18:00:00.000Z",
      reportDocument: {
        id: "document-1",
        url: "https://cdn.test/report.pdf",
        fileName: "report.pdf",
        fileType: "application/pdf",
        fileSizeBytes: 20,
      },
    });
    expect(mockedDestroy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("requires a PDF report_document", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    const { req, res, next } = buildMockReqRes("user-1", false);

    await submitAgentReport(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const { req, res, next } = buildMockReqRes();

    await submitAgentReport(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });
});
