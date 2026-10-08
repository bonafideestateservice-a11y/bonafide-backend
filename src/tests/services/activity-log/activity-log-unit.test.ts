const prisma = {
  verificationAgent: { findUnique: jest.fn() },
  verificationRequest: { findUnique: jest.fn() },
  activityLog: { create: jest.fn() },
};
jest.mock("../../../utils/prisma", () => ({ prismaClient: prisma }));

import { AppEventTypes } from "../../../events";
import { recordActivity, recordPropertyAdded } from "../../../api/services/database/activity-log";

const saved = () => prisma.activityLog.create.mock.calls[0]?.[0]?.data;

describe("recordActivity (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.verificationRequest.findUnique.mockResolvedValue({
      user: { fullName: "Michael Brown" },
    });
    prisma.verificationAgent.findUnique.mockResolvedValue({ name: "Emma Wilson" });
  });

  it("names the client on a new request", async () => {
    await recordActivity(AppEventTypes.VERIFICATION_REQUEST_CREATED, {
      verificationRequestId: "r1",
      userId: "u1",
    });
    expect(saved()).toEqual({
      type: "VERIFICATION_REQUEST_CREATED",
      verificationRequestId: "r1",
      subjectName: "Michael Brown",
      clientName: "Michael Brown",
      agentName: undefined,
      amount: undefined,
    });
  });

  it("stores the payment amount", async () => {
    await recordActivity(AppEventTypes.PAYMENT_RECEIVED, {
      userId: "u1",
      email: "m@example.com",
      firstName: "Michael",
      amount: 7500000,
      reference: "ref",
      payment_receipt: "ref",
      booking_ref: "r1",
      receipt_id: "t1",
      currency: "NGN",
    });
    expect(saved()).toMatchObject({
      type: "PAYMENT_RECEIVED",
      subjectName: "Michael Brown",
      clientName: "Michael Brown",
      amount: 7500000,
    });
  });

  it.each([
    [
      AppEventTypes.AGENT_ASSIGNED,
      { verificationRequestId: "r1", agentId: "a1", assignmentId: "x" },
    ],
    [AppEventTypes.INSPECTION_STARTED, { verificationRequestId: "r1", agentId: "a1" }],
    [AppEventTypes.REPORT_UPLOADED, { verificationRequestId: "r1", submittedByAgentId: "a1" }],
  ])("names both the agent and the client on %s", async (type, payload) => {
    await recordActivity(type as AppEventTypes.AGENT_ASSIGNED, payload as never);
    expect(saved()).toMatchObject({
      type,
      subjectName: "Emma Wilson",
      clientName: "Michael Brown",
      agentName: "Emma Wilson",
    });
  });

  it("skips events the feed doesn't show and requests that no longer exist", async () => {
    await recordActivity(AppEventTypes.USER_REGISTERED, { userId: "u1" } as never);
    prisma.verificationRequest.findUnique.mockResolvedValue(null);
    await recordActivity(AppEventTypes.VERIFICATION_REQUEST_CREATED, {
      verificationRequestId: "gone",
      userId: "u1",
    });
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("recordPropertyAdded (unit)", () => {
  it("records the property and who added it", async () => {
    await recordPropertyAdded({ id: "p1", name: "4 Bedroom Duplex" }, "Sarah Wilson");
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: {
        type: "PROPERTY_ADDED",
        propertyId: "p1",
        subjectName: "4 Bedroom Duplex",
        clientName: "Sarah Wilson",
      },
    });
  });
});
