jest.mock("../../../../../api/admin/dashboard/services/database/dashboard", () => ({
  ...jest.requireActual("../../../../../api/admin/dashboard/services/database/dashboard"),
  getDashboardAnalytics: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { getDashboardAnalyticsHandler } from "../../../../../api/admin/dashboard/handlers/get-dashboard-analytics";
import { getDashboardAnalytics } from "../../../../../api/admin/dashboard/services/database/dashboard";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mocked = getDashboardAnalytics as jest.Mock;

describe("getDashboardAnalyticsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("defaults to this_week", async () => {
    mocked.mockResolvedValue({ range: "this_week", points: [] });
    const { res } = await callHandler(getDashboardAnalyticsHandler);
    expect(mocked).toHaveBeenCalledWith("this_week");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each(["last_week", "this_month"])("passes range=%s through", async (range) => {
    mocked.mockResolvedValue({ range, points: [] });
    await callHandler(getDashboardAnalyticsHandler, { query: { range } });
    expect(mocked).toHaveBeenCalledWith(range);
  });

  it("rejects an unknown range", async () => {
    const { next } = await callHandler(getDashboardAnalyticsHandler, { query: { range: "year" } });
    expect(errorStatus(next)).toBe(400);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("returns 500 when the query fails", async () => {
    mocked.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getDashboardAnalyticsHandler);
    expect(errorStatus(next)).toBe(500);
  });
});
