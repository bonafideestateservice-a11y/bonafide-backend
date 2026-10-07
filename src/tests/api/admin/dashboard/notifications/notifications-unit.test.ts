jest.mock("../../../../../api/services/database/notifications", () => ({
  getInAppNotifications: jest.fn(),
  markInAppNotificationsRead: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import {
  getNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../../../../../api/admin/dashboard/handlers/get-notifications";
import {
  getInAppNotifications,
  markInAppNotificationsRead,
} from "../../../../../api/services/database/notifications";
import { callHandler, errorStatus } from "../../../../helpers/http";

const list = getInAppNotifications as jest.Mock;
const markRead = markInAppNotificationsRead as jest.Mock;
const user = { id: "admin-1" };

describe("notification handlers (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the caller's inbox with paging and unreadOnly", async () => {
    list.mockResolvedValue({ data: [], unreadCount: 0, meta: {} });
    const { res } = await callHandler(getNotificationsHandler, {
      user,
      query: { page: "2", limit: "5", unreadOnly: "true" },
    });
    expect(list).toHaveBeenCalledWith("admin-1", { page: 2, limit: 5, unreadOnly: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects bad paging", async () => {
    const { next } = await callHandler(getNotificationsHandler, { user, query: { limit: "0" } });
    expect(errorStatus(next)).toBe(400);
  });

  it("marks one notification read", async () => {
    markRead.mockResolvedValue({ count: 1 });
    const { res } = await callHandler(markNotificationReadHandler, { user, params: { id: "n1" } });
    expect(markRead).toHaveBeenCalledWith("admin-1", "n1");
    expect(res.json).toHaveBeenCalledWith({ id: "n1", read: true });
  });

  it("returns 404 for a notification that isn't the caller's", async () => {
    markRead.mockResolvedValue({ count: 0 });
    const { next } = await callHandler(markNotificationReadHandler, { user, params: { id: "x" } });
    expect(errorStatus(next)).toBe(404);
  });

  it("marks all read and reports how many", async () => {
    markRead.mockResolvedValue({ count: 3 });
    const { res } = await callHandler(markAllNotificationsReadHandler, { user });
    expect(markRead).toHaveBeenCalledWith("admin-1");
    expect(res.json).toHaveBeenCalledWith({ updated: 3 });
  });

  it("returns 500 when the query fails", async () => {
    list.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getNotificationsHandler, { user });
    expect(errorStatus(next)).toBe(500);
  });
});
