const enqueueNotificationEvent = jest.fn();

jest.mock("../../jobs/notifications/queue", () => ({
  enqueueNotificationEvent,
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { appEvents, AppEventTypes } from "../../events";
import { logger } from "../../utils/logger";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("event listeners", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enqueueNotificationEvent.mockResolvedValue({ id: "job-1" });
  });

  it.each([
    [AppEventTypes.USER_REGISTERED, { userId: "user-1", email: "a@b.com", firstName: "A" }],
    [
      AppEventTypes.FORGOT_PASSWORD,
      { userId: "user-1", email: "a@b.com", otp: "123456", expiresIn: "10 minutes" },
    ],
    [AppEventTypes.VERIFICATION_REQUEST_CREATED, { verificationRequestId: "vr-1", userId: "u" }],
    [
      AppEventTypes.REPORT_UPLOADED,
      { reportId: "r-1", verificationRequestId: "vr-1", submittedByAgentId: "agent-1" },
    ],
    [
      AppEventTypes.AGENT_ASSIGNED,
      { assignmentId: "as-1", verificationRequestId: "vr-1", agentId: "agent-1" },
    ],
    [
      AppEventTypes.INSPECTION_STARTED,
      { assignmentId: "as-1", verificationRequestId: "vr-1", agentId: "agent-1" },
    ],
  ])("queues %s with its payload", async (eventType, payload) => {
    appEvents.emit(eventType, payload);
    await flush();

    expect(enqueueNotificationEvent).toHaveBeenCalledWith(eventType, payload);
  });

  it("logs when an event cannot be queued without throwing from emit", async () => {
    enqueueNotificationEvent.mockRejectedValue(new Error("REDIS_URL is required"));

    expect(() =>
      appEvents.emit(AppEventTypes.USER_REGISTERED, {
        userId: "user-1",
        email: "a@b.com",
        firstName: "A",
      }),
    ).not.toThrow();
    await flush();

    expect(logger.error).toHaveBeenCalledWith("[event] USER_REGISTERED could not be queued", {
      message: "REDIS_URL is required",
    });
  });
});
