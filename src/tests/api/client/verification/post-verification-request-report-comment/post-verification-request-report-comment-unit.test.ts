import { postVerificationRequestReportComment } from "../../../../../api/client/verification/handlers/post-verification-request-report-comment";
import {
  findLatestReport,
  saveReportFeedback,
} from "../../../../../api/client/verification/services/database/verification-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/verification/services/database/verification-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFind = findLatestReport as jest.Mock;
const mockedSave = saveReportFeedback as jest.Mock;
const call = (body: unknown) =>
  callHandler(postVerificationRequestReportComment, {
    params: { id: "req-1" },
    user: { id: "user-1" },
    body,
  });

describe("postVerificationRequestReportComment (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFind.mockResolvedValue({ userId: "user-1", reports: [{ id: "rep-1" }] });
  });

  it("saves the rating and trimmed comment on the latest report", async () => {
    const ratedAt = new Date("2026-10-08T14:02:11.000Z");
    mockedSave.mockResolvedValue({ id: "rep-1", rating: 4, clientComment: "Good", ratedAt });

    const { res } = await call({ rating: 4, comment: "  Good  " });

    expect(mockedFind).toHaveBeenCalledWith("req-1");
    expect(mockedSave).toHaveBeenCalledWith("rep-1", 4, "Good");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reportId: "rep-1",
      rating: 4,
      comment: "Good",
      ratedAt: ratedAt.toISOString(),
    });
  });

  it("saves no comment when it's missing or blank", async () => {
    mockedSave.mockResolvedValue({
      id: "rep-1",
      rating: 5,
      clientComment: null,
      ratedAt: new Date(),
    });
    await call({ rating: 5 });
    await call({ rating: 5, comment: "   " });
    expect(mockedSave.mock.calls).toEqual([
      ["rep-1", 5, null],
      ["rep-1", 5, null],
    ]);
  });

  it.each([
    [{}],
    [{ rating: 0 }],
    [{ rating: 6 }],
    [{ rating: 3.5 }],
    [{ rating: "4" }],
    [{ rating: 4, comment: 12 }],
    [{ rating: 4, comment: "x".repeat(1001) }],
  ])("returns 400 for body %j", async (body) => {
    const { next } = await call(body);
    expect(errorStatus(next)).toBe(400);
    expect(mockedFind).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown request or one with no report", async () => {
    mockedFind.mockResolvedValueOnce(null);
    expect(errorStatus((await call({ rating: 4 })).next)).toBe(404);
    mockedFind.mockResolvedValueOnce({ userId: "user-1", reports: [] });
    expect(errorStatus((await call({ rating: 4 })).next)).toBe(404);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("returns 403 for another client's request", async () => {
    mockedFind.mockResolvedValue({ userId: "someone-else", reports: [{ id: "rep-1" }] });
    expect(errorStatus((await call({ rating: 4 })).next)).toBe(403);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("returns 500 when saving fails", async () => {
    mockedSave.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call({ rating: 4 })).next)).toBe(500);
  });
});
