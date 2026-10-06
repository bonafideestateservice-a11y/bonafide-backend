const getAdminNotificationRecipients = jest.fn();
const getNotificationRecipient = jest.fn();
const getVerificationRequestNotificationContext = jest.fn();

jest.mock("../../../api/services/database/notifications", () => ({
  getAdminNotificationRecipients,
  getNotificationRecipient,
  getVerificationRequestNotificationContext,
}));

jest.mock("../../../jobs/notifications/queue", () => ({
  enqueueNotificationEvent: jest.fn(),
}));

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { AppEventTypes } from "../../../events";
import { notificationEventHandlers } from "../../../jobs/notifications/event-handlers";
import { NotificationDelivery } from "../../../jobs/notifications/types";
import { EmailTemplate } from "../../../libs/zeptomail/templates";

const admins = [
  { id: "admin-1", email: "admin1@example.com", fullName: "Admin One", phone: null },
  { id: "admin-2", email: "admin2@example.com", fullName: "Admin Two", phone: null },
];

const client = { id: "user-1", email: "user@example.com", fullName: "Test User", phone: "0801" };
const agentUser = { id: "agent-user-1", email: "agent@example.com", fullName: "Agent Smith" };

const context = (overrides: Record<string, unknown> = {}) => ({
  id: "vr-1",
  verificationTypeId: "type-1",
  createdAt: new Date("2026-09-30T10:00:00.000Z"),
  details: { propertyName: "Palm Villa", propertyAddress: "12 Allen Avenue, Ikeja" },
  notifyOnInspectionStart: true,
  notifyOnReportReady: true,
  user: client,
  verificationType: { name: "Land", serviceId: "service-1", service: { name: "Property" } },
  agentAssignment: {
    agent: { name: "Agent Smith", phone: "0802", user: { ...agentUser, phone: null } },
  },
  ...overrides,
});

const summarize = (deliveries: NotificationDelivery[]) =>
  deliveries
    .map((d) => `${d.recipient.id}:${d.channel}:${d.channel === "email" ? d.email.template : ""}`)
    .sort();

const emailFor = (deliveries: NotificationDelivery[], userId: string) => {
  const delivery = deliveries.find((d) => d.recipient.id === userId && d.channel === "email");
  return delivery?.channel === "email" ? delivery.email : undefined;
};

describe("notification event handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAdminNotificationRecipients.mockResolvedValue(admins);
    getVerificationRequestNotificationContext.mockResolvedValue(context());
  });

  it("USER_REGISTERED emails only the registered user, untracked", async () => {
    const deliveries = await notificationEventHandlers[AppEventTypes.USER_REGISTERED]({
      userId: "user-1",
      email: "user@example.com",
      firstName: "Test User",
    });

    expect(deliveries).toEqual([
      {
        channel: "email",
        recipient: { id: "user-1", email: "user@example.com", fullName: "Test User" },
        email: {
          template: EmailTemplate.USER_REGISTERED,
          data: { firstName: "Test User", email: "user@example.com" },
        },
      },
    ]);
  });

  it("FORGOT_PASSWORD emails the initiating user with their stored name", async () => {
    getNotificationRecipient.mockResolvedValue(client);

    const deliveries = await notificationEventHandlers[AppEventTypes.FORGOT_PASSWORD]({
      userId: "user-1",
      email: "user@example.com",
      otp: "123456",
      expiresIn: "10 minutes",
    });

    expect(summarize(deliveries)).toEqual(["user-1:email:FORGOT_PASSWORD"]);
    expect(deliveries[0]).not.toHaveProperty("notification");
    expect(emailFor(deliveries, "user-1")?.data).toEqual({
      firstName: "Test User",
      otp: "123456",
      resetLink: "123456",
      expiresIn: "10 minutes",
    });
  });

  it("PAYMENT_RECEIVED notifies the payer and every admin with formatted amounts", async () => {
    const deliveries = await notificationEventHandlers[AppEventTypes.PAYMENT_RECEIVED]({
      userId: "user-1",
      email: "user@example.com",
      firstName: "Test User",
      amount: 150000,
      reference: "ref-1",
      payment_receipt: "ref-1",
      booking_ref: "vr-1",
      receipt_id: "txn-1",
      currency: "NGN",
    });

    expect(getAdminNotificationRecipients).toHaveBeenCalledWith(["user-1"]);
    expect(summarize(deliveries)).toEqual([
      "admin-1:email:PAYMENT_RECEIVED_ADMIN",
      "admin-1:in_app:",
      "admin-2:email:PAYMENT_RECEIVED_ADMIN",
      "admin-2:in_app:",
      "user-1:email:PAYMENT_RECEIVED",
      "user-1:in_app:",
    ]);
    expect(emailFor(deliveries, "user-1")?.data).toMatchObject({
      firstName: "Test User",
      amount: "1,500.00",
      currency: "NGN",
      service_name: "",
    });
    expect(emailFor(deliveries, "admin-1")?.data).toMatchObject({
      firstName: "Admin One",
      clientName: "Test User",
      clientEmail: "user@example.com",
    });
  });

  it("VERIFICATION_REQUEST_CREATED notifies the requester and admins with request details", async () => {
    const deliveries = await notificationEventHandlers[AppEventTypes.VERIFICATION_REQUEST_CREATED]({
      verificationRequestId: "vr-1",
      userId: "user-1",
    });

    expect(summarize(deliveries)).toEqual([
      "admin-1:email:VERIFICATION_REQUEST_CREATED_ADMIN",
      "admin-1:in_app:",
      "admin-2:email:VERIFICATION_REQUEST_CREATED_ADMIN",
      "admin-2:in_app:",
      "user-1:email:VERIFICATION_REQUEST_CREATED",
      "user-1:in_app:",
    ]);
    expect(emailFor(deliveries, "admin-2")?.data).toEqual({
      firstName: "Admin Two",
      verificationRequestId: "vr-1",
      verificationType: "Land",
      serviceName: "Property",
      requestName: "Palm Villa",
      address: "12 Allen Avenue, Ikeja",
      clientName: "Test User",
      clientEmail: "user@example.com",
      clientPhone: "0801",
      submittedAt: "2026-09-30T10:00:00.000Z",
    });
  });

  it("REPORT_UPLOADED skips the requester when they opted out of report notifications", async () => {
    getVerificationRequestNotificationContext.mockResolvedValue(
      context({ notifyOnReportReady: false }),
    );

    const deliveries = await notificationEventHandlers[AppEventTypes.REPORT_UPLOADED]({
      reportId: "r-1",
      verificationRequestId: "vr-1",
      submittedByAgentId: "agent-1",
    });

    expect(deliveries.some((d) => d.recipient.id === "user-1")).toBe(false);
    expect(summarize(deliveries)).toContain("admin-1:email:REPORT_UPLOADED_ADMIN");
  });

  it("AGENT_ASSIGNED notifies the requester and the assigned agent, not admins", async () => {
    const deliveries = await notificationEventHandlers[AppEventTypes.AGENT_ASSIGNED]({
      assignmentId: "as-1",
      verificationRequestId: "vr-1",
      agentId: "agent-1",
    });

    expect(getAdminNotificationRecipients).not.toHaveBeenCalled();
    expect(summarize(deliveries)).toEqual([
      "agent-user-1:email:AGENT_ASSIGNED_AGENT",
      "agent-user-1:in_app:",
      "user-1:email:AGENT_ASSIGNED",
      "user-1:in_app:",
    ]);
    expect(emailFor(deliveries, "user-1")?.data).toMatchObject({
      agentName: "Agent Smith",
      agentPhone: "0802",
    });
    expect(deliveries.every((d) => !("phone" in d.recipient))).toBe(true);
  });

  it("INSPECTION_STARTED notifies the requester and admins", async () => {
    const deliveries = await notificationEventHandlers[AppEventTypes.INSPECTION_STARTED]({
      assignmentId: "as-1",
      verificationRequestId: "vr-1",
      agentId: "agent-1",
    });

    expect(summarize(deliveries)).toEqual([
      "admin-1:email:INSPECTION_STARTED_ADMIN",
      "admin-1:in_app:",
      "admin-2:email:INSPECTION_STARTED_ADMIN",
      "admin-2:in_app:",
      "user-1:email:INSPECTION_STARTED",
      "user-1:in_app:",
    ]);
  });

  it("returns no deliveries when the verification request no longer exists", async () => {
    getVerificationRequestNotificationContext.mockResolvedValue(null);

    const deliveries = await notificationEventHandlers[AppEventTypes.INSPECTION_STARTED]({
      assignmentId: "as-1",
      verificationRequestId: "missing",
      agentId: "agent-1",
    });

    expect(deliveries).toEqual([]);
  });
});
