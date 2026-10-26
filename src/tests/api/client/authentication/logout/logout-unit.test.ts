jest.mock("../../../../../api/services/database/fcm-token", () => ({
  saveFcmTokenForUser: jest.fn(),
  deactivateFcmTokenForUser: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { logoutHandler } from "../../../../../api/services/handlers/fcm-token";
import { deactivateFcmTokenForUser } from "../../../../../api/services/database/fcm-token";
import { callHandler, errorStatus } from "../../../../helpers/http";

const deactivate = deactivateFcmTokenForUser as jest.Mock;
const user = { id: "u1" };

describe("logoutHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deactivates the browser's FCM token", async () => {
    deactivate.mockResolvedValue(1);
    const { res } = await callHandler(logoutHandler, { user, body: { fcmToken: "abc" } });
    expect(deactivate).toHaveBeenCalledWith("u1", "abc");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "Logged out." });
  });

  it("logs out without an FCM token", async () => {
    const { res } = await callHandler(logoutHandler, { user, body: undefined });
    expect(deactivate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a non-string FCM token", async () => {
    const { next } = await callHandler(logoutHandler, { user, body: { fcmToken: 1 } });
    expect(errorStatus(next)).toBe(400);
  });

  it("returns 500 when deactivating fails", async () => {
    deactivate.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(logoutHandler, { user, body: { fcmToken: "abc" } });
    expect(errorStatus(next)).toBe(500);
  });
});
