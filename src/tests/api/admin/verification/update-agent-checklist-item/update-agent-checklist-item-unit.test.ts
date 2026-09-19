import { NextFunction, Request, Response } from "express";
import { updateAgentChecklistItemHandler } from "../../../../../api/admin/verification/handlers/update-agent-checklist-item";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { updateAgentChecklistItem } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn().mockResolvedValue({ secure_url: "https://cdn.test/photo.jpg" }) },
  },
}));
jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedUpdateItem = updateAgentChecklistItem as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}, files?: Express.Multer.File[]) {
  const req = {
    user: { id: "user-1" },
    params: { id: "assignment-1", itemId: "item-1" },
    body,
    files,
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("updateAgentChecklistItemHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  it("updates a checklist item without media", async () => {
    const item = { id: "item-1", label: "Front view", status: "COMPLETE", media: [] };
    mockedUpdateItem.mockResolvedValue(item);
    const { req, res, next } = buildMockReqRes({ status: "COMPLETE" });

    await updateAgentChecklistItemHandler(req, res, next);

    expect(mockedUpdateItem).toHaveBeenCalledWith(
      "agent-1",
      "assignment-1",
      "item-1",
      "COMPLETE",
      [],
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(item);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid status", async () => {
    const { req, res, next } = buildMockReqRes({ status: "DONE" });

    await updateAgentChecklistItemHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  it("returns 404 when the checklist item is not owned by the agent", async () => {
    mockedUpdateItem.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes({ status: "COMPLETE" });

    await updateAgentChecklistItemHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
