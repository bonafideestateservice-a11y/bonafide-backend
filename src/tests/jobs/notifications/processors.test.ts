const createNotification = jest.fn();
const findNotification = jest.fn();
const updateNotification = jest.fn();
const isNotificationChannelEnabled = jest.fn();
const sendTemplateEmail = jest.fn();
const sendNotificationToUser = jest.fn();
const enqueueNotificationDeliveries = jest.fn();

jest.mock("../../../api/services/database/notifications", () => ({
  createNotification,
  findNotification,
  updateNotification,
  isNotificationChannelEnabled,
}));

jest.mock("../../../libs/zeptomail/zeptomail", () => {
  const actual = jest.requireActual("../../../libs/zeptomail/zeptomail");
  return { ...actual, sendTemplateEmail };
});

jest.mock("../../../libs/firebase/firebase", () => ({ sendNotificationToUser }));

jest.mock("../../../jobs/notifications/queue", () => ({
  enqueueNotificationDeliveries,
  enqueueNotificationEvent: jest.fn(),
}));

jest.mock("../../../jobs/notifications/event-handlers", () => ({
  notificationEventHandlers: {
    USER_REGISTERED: jest.fn(async () => [{ channel: "email" }]),
  },
}));

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { UnrecoverableError, type Job } from "bullmq";
import { NotificationStatus, NotificationType } from "@prisma/client";
import {
  processNotificationDelivery,
  processNotificationEvent,
} from "../../../jobs/notifications/processors";
import { NotificationDelivery } from "../../../jobs/notifications/types";
import { EmailTemplate } from "../../../libs/zeptomail/templates";
import { EmailTemplateNotConfiguredError } from "../../../libs/zeptomail/zeptomail";

const recipient = { id: "user-1", email: "user@example.com", fullName: "Test User" };
const notification = {
  type: NotificationType.AGENT_ASSIGNED,
  title: "Agent assigned",
  body: "An agent has been assigned.",
  meta: { assignmentId: "as-1" },
};
const email = {
  template: EmailTemplate.USER_REGISTERED,
  data: { firstName: "Test User", email: "user@example.com" },
} as const;

const jobFor = (data: NotificationDelivery, attemptsMade = 0) =>
  ({
    id: "job-1",
    name: "AGENT_ASSIGNED",
    data,
    attemptsMade,
    updateData: jest.fn(),
  }) as unknown as Job<NotificationDelivery> & { updateData: jest.Mock };

describe("processNotificationEvent", () => {
  it("queues the deliveries returned by the event handler", async () => {
    const job = { id: "event-1", name: "USER_REGISTERED", data: {} } as unknown as Job;

    await expect(processNotificationEvent(job as never)).resolves.toEqual({ deliveries: 1 });
    expect(enqueueNotificationDeliveries).toHaveBeenCalledWith(job, [{ channel: "email" }]);
  });

  it("fails permanently for events without a handler", async () => {
    const job = { id: "event-1", name: "USER_LOGIN", data: {} } as unknown as Job;

    await expect(processNotificationEvent(job as never)).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe("processNotificationDelivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isNotificationChannelEnabled.mockResolvedValue(true);
    createNotification.mockImplementation(async (data) => ({ id: "notification-1", ...data }));
    updateNotification.mockResolvedValue({});
    sendTemplateEmail.mockResolvedValue({});
    sendNotificationToUser.mockResolvedValue({ ok: true, receipts: [] });
  });

  it("sends untracked emails without checking settings or recording a notification", async () => {
    await processNotificationDelivery(jobFor({ channel: "email", recipient, email }));

    expect(isNotificationChannelEnabled).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(sendTemplateEmail).toHaveBeenCalledWith({
      to: { email: "user@example.com", name: "Test User" },
      content: email,
    });
  });

  it("still records the inbox notification but sends no phone push when push is off", async () => {
    isNotificationChannelEnabled.mockResolvedValue(false);

    const result = await processNotificationDelivery(
      jobFor({ channel: "in_app", recipient, notification }),
    );

    expect(isNotificationChannelEnabled).toHaveBeenCalledWith("user-1", "push");
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(sendNotificationToUser).not.toHaveBeenCalled();
    expect(updateNotification).toHaveBeenCalledWith(
      { id: "notification-1" },
      expect.objectContaining({ notificationStatus: NotificationStatus.SENT }),
    );
    expect(result).toEqual({ ok: true, meta: { push: "disabled" } });
  });

  it("skips tracked emails when email is off", async () => {
    isNotificationChannelEnabled.mockResolvedValue(false);

    const result = await processNotificationDelivery(
      jobFor({ channel: "email", recipient, notification, email }),
    );

    expect(result).toEqual({ ok: true, skipped: "disabled" });
    expect(createNotification).not.toHaveBeenCalled();
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("records a tracked email, stores the notification id on the job, and marks it sent", async () => {
    const job = jobFor({ channel: "email", recipient, notification, email });

    await processNotificationDelivery(job);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        notificationStatus: NotificationStatus.PENDING,
        meta: { assignmentId: "as-1", channel: "email" },
      }),
    );
    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: "notification-1" }),
    );
    expect(updateNotification).toHaveBeenCalledWith(
      { id: "notification-1" },
      expect.objectContaining({ notificationStatus: NotificationStatus.SENT }),
    );
  });

  it("reuses the notification row on retry and marks it failed when delivery throws", async () => {
    findNotification.mockResolvedValue({
      id: "notification-1",
      notificationStatus: NotificationStatus.FAILED,
    });
    sendTemplateEmail.mockRejectedValue(new Error("mail provider unavailable"));
    const job = jobFor(
      { channel: "email", recipient, notification, email, notificationId: "notification-1" },
      1,
    );

    await expect(processNotificationDelivery(job)).rejects.toThrow("mail provider unavailable");
    expect(createNotification).not.toHaveBeenCalled();
    expect(updateNotification).toHaveBeenCalledWith(
      { id: "notification-1" },
      expect.objectContaining({
        notificationStatus: NotificationStatus.FAILED,
        meta: expect.objectContaining({ error: "mail provider unavailable", attempts: 2 }),
      }),
    );
  });

  it("does not resend a delivery that already succeeded", async () => {
    findNotification.mockResolvedValue({
      id: "notification-1",
      notificationStatus: NotificationStatus.SENT,
    });

    const result = await processNotificationDelivery(
      jobFor({
        channel: "email",
        recipient,
        notification,
        email,
        notificationId: "notification-1",
      }),
    );

    expect(result).toEqual({ ok: true, skipped: "already-sent" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("fails permanently when the email template key is not configured", async () => {
    sendTemplateEmail.mockRejectedValue(new EmailTemplateNotConfiguredError("AGENT_ASSIGNED"));

    await expect(
      processNotificationDelivery(jobFor({ channel: "email", recipient, notification, email })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
