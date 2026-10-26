jest.mock("../../../../../api/services/database/fcm-token", () => ({
  saveFcmTokenForUser: jest.fn(),
  deactivateFcmTokenForUser: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { registerFcmTokenHandler } from "../../../../../api/services/handlers/fcm-token";
import { saveFcmTokenForUser } from "../../../../../api/services/database/fcm-token";
import { callHandler, errorStatus } from "../../../../helpers/http";

const save = saveFcmTokenForUser as jest.Mock;
const user = { id: "u1" };

describe("registerFcmTokenHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves the trimmed token for the logged-in user", async () => {
    save.mockResolvedValue({ id: "t1" });
    const { res } = await callHandler(registerFcmTokenHandler, {
      user,
      body: { fcmToken: "  abc:123  " },
    });
    expect(save).toHaveBeenCalledWith("u1", "abc:123");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "FCM token saved." });
  });

  it.each([{}, { fcmToken: " " }, { fcmToken: 42 }, { fcmToken: "x".repeat(4097) }])(
    "rejects body %#",
    async (body) => {
      const { next } = await callHandler(registerFcmTokenHandler, { user, body });
      expect(errorStatus(next)).toBe(400);
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("returns 500 when saving fails", async () => {
    save.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(registerFcmTokenHandler, {
      user,
      body: { fcmToken: "abc" },
    });
    expect(errorStatus(next)).toBe(500);
  });
});
