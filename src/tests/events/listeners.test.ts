const sendMailWithTemplate = jest.fn();

jest.mock("../../libs/zeptomail", () => ({
  appEventTypeToEmailConfig: {
    USER_REGISTERED: {
      templateKey: "user-registered-template",
      buildMergeInfo: (payload: Record<string, string>) => payload,
    },
    FORGOT_PASSWORD: {
      templateKey: "forgot-password-template",
      buildMergeInfo: (payload: Record<string, string>) => payload,
    },
  },
  clientSendMailWithTemplate: sendMailWithTemplate,
}));

jest.mock("../../libs/firebase/firebase", () => ({
  sendNotificationToUser: jest.fn(),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { appEvents, AppEventTypes } from "../../events";
import { logger } from "../../utils/logger";

describe("USER_REGISTERED listener", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMailWithTemplate.mockResolvedValue(undefined);
  });

  it("sends the registration email using the configured template", async () => {
    appEvents.emit(AppEventTypes.USER_REGISTERED, {
      userId: "user-1",
      email: "user@example.com",
      firstName: "Test User",
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendMailWithTemplate).toHaveBeenCalledWith({
      mail_template_key: "user-registered-template",
      email_address: "user@example.com",
      name: "Test User",
      merge_info: { firstName: "Test User" },
    });
    expect(logger.info).toHaveBeenCalledWith(
      "[event] USER_REGISTERED email sent to user@example.com",
    );
  });

  it("logs registration email delivery failures", async () => {
    const error = new Error("mail provider unavailable");
    sendMailWithTemplate.mockRejectedValue(error);

    appEvents.emit(AppEventTypes.USER_REGISTERED, {
      userId: "user-1",
      email: "user@example.com",
      firstName: "Test User",
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith("[event] USER_REGISTERED email delivery failed", {
      email: "user@example.com",
      userId: "user-1",
      error,
    });
  });
});

describe("FORGOT_PASSWORD listener", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMailWithTemplate.mockResolvedValue(undefined);
  });

  it("sends the reset OTP using the configured template", async () => {
    appEvents.emit(AppEventTypes.FORGOT_PASSWORD, {
      userId: "user-1",
      email: "user@example.com",
      otp: "123456",
      expiresIn: "10 minutes",
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sendMailWithTemplate).toHaveBeenCalledWith({
      mail_template_key: "forgot-password-template",
      email_address: "user@example.com",
      name: "user",
      merge_info: {
        firstName: "user",
        resetLink: "123456",
        otp: "123456",
        expiresIn: "10 minutes",
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      "[event] FORGOT_PASSWORD email sent to user@example.com",
    );
  });

  it("logs delivery failures without throwing from the event listener", async () => {
    const error = new Error("mail provider unavailable");
    sendMailWithTemplate.mockRejectedValue(error);

    appEvents.emit(AppEventTypes.FORGOT_PASSWORD, {
      userId: "user-1",
      email: "user@example.com",
      otp: "123456",
      expiresIn: "10 minutes",
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith("[event] FORGOT_PASSWORD email delivery failed", {
      email: "user@example.com",
      userId: "user-1",
      error,
    });
  });
});
