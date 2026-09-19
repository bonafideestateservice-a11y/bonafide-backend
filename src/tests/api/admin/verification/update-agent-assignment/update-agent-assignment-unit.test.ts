import { NextFunction, Request, Response } from "express";
import { updateAgentAssignmentNotes } from "../../../../../api/admin/verification/handlers/update-agent-assignment-notes";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { updateAgentAssignmentNotes as updateAssignmentNotesService } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedUpdateNotes = updateAssignmentNotesService as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}) {
  const req = {
    user: { id: "user-1" },
    params: { id: "assignment-1" },
    body,
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("updateAgentAssignmentNotes handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  it("updates assignment notes", async () => {
    mockedUpdateNotes.mockResolvedValue(true);
    const { req, res, next } = buildMockReqRes({ additionalNotes: "Call before arrival." });

    await updateAgentAssignmentNotes(req, res, next);

    expect(mockedUpdateNotes).toHaveBeenCalledWith(
      "agent-1",
      "assignment-1",
      "Call before arrival.",
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "assignment-1",
      additionalNotes: "Call before arrival.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a missing notes value", async () => {
    const { req, res, next } = buildMockReqRes();

    await updateAgentAssignmentNotes(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedUpdateNotes).not.toHaveBeenCalled();
  });

  it("returns 404 when the assignment is not owned by the agent", async () => {
    mockedUpdateNotes.mockResolvedValue(false);
    const { req, res, next } = buildMockReqRes({ additionalNotes: "Updated" });

    await updateAgentAssignmentNotes(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
