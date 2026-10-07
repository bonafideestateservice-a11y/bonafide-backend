import { NextFunction, Request, Response } from "express";
import getAllActivities from "../../../../../api/admin/dashboard/handlers/get-all-activities";
import { getActivities } from "../../../../../api/admin/dashboard/services/database/activities";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/dashboard/services/database/activities");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetActivities = getActivities as jest.Mock;

const run = async (query: Record<string, string | undefined> = {}) => {
  const req = { query } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  await getAllActivities(req, res, next);
  return { res, next };
};

describe("getAllActivities handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a page of activity", async () => {
    const page = { data: [{ id: "a1", type: "AGENT_ASSIGNED", subjectName: "Ada" }], meta: {} };
    mockedGetActivities.mockResolvedValue(page);

    const { res } = await run({ page: "2", limit: "5" });

    expect(mockedGetActivities).toHaveBeenCalledWith(2, 5);
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it.each([{ page: "0" }, { limit: "101" }, { limit: "abc" }])(
    "rejects invalid paging %j",
    async (query) => {
      const { next } = await run(query);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
      );
      expect(mockedGetActivities).not.toHaveBeenCalled();
    },
  );

  it("forwards database errors", async () => {
    mockedGetActivities.mockRejectedValue(new Error("DB exploded"));

    const { next } = await run();

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
