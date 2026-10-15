import { markAllClientNotificationsReadHandler } from "../../../../../api/client/notifications/handlers/mark-all-notifications-read";
import { markInAppNotificationsRead } from "../../../../../api/services/database/notifications";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/notifications");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedMark = markInAppNotificationsRead as jest.Mock;
const call = () => callHandler(markAllClientNotificationsReadHandler, { user: { id: "user-1" } });

describe("markAllClientNotificationsReadHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks all of the client's notifications read", async () => {
    mockedMark.mockResolvedValue({ count: 3 });
    const { res } = await call();
    expect(mockedMark).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ updated: 3 });
  });

  it("returns 500 when the update fails", async () => {
    mockedMark.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
