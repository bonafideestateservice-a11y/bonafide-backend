import { markClientNotificationReadHandler } from "../../../../../api/client/notifications/handlers/mark-notification-read";
import { markInAppNotificationsRead } from "../../../../../api/services/database/notifications";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/notifications");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedMark = markInAppNotificationsRead as jest.Mock;
const call = () =>
  callHandler(markClientNotificationReadHandler, { user: { id: "user-1" }, params: { id: "n1" } });

describe("markClientNotificationReadHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks the client's notification read", async () => {
    mockedMark.mockResolvedValue({ count: 1 });
    const { res } = await call();
    expect(mockedMark).toHaveBeenCalledWith("user-1", "n1");
    expect(res.json).toHaveBeenCalledWith({ id: "n1", read: true });
  });

  it("returns 404 when the notification isn't the client's", async () => {
    mockedMark.mockResolvedValue({ count: 0 });
    expect(errorStatus((await call()).next)).toBe(404);
  });

  it("returns 500 when the update fails", async () => {
    mockedMark.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
