const prisma = {
  property: { findFirst: jest.fn() },
  propertyRequest: { findFirst: jest.fn(), create: jest.fn() },
  notification: { createMany: jest.fn() },
};
jest.mock("../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../api/services/database/notifications", () => ({
  getAdminNotificationRecipients: jest.fn(async () => [{ id: "admin-1" }, { id: "admin-2" }]),
}));
jest.mock("../../../events", () => ({
  appEvents: { emit: jest.fn() },
  AppEventTypes: { PROPERTY_REQUEST_CREATED: "PROPERTY_REQUEST_CREATED" },
}));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { createPropertyRequest } from "../../../api/services/database/property-request";
import { appEvents } from "../../../events";
import { logger } from "../../../utils/logger";

describe("property request notifications (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.property.findFirst.mockResolvedValue({ id: "p1" });
    prisma.propertyRequest.findFirst.mockResolvedValue(null);
    prisma.propertyRequest.create.mockResolvedValue({
      id: "r1",
      reference: "BF-PUR-123456",
      user: { fullName: "John Doe" },
      property: { name: "Lekki Apartment" },
    });
  });

  it("notifies every admin about a new purchase request", async () => {
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await createPropertyRequest("u1", "p1", "PURCHASE");

    const { data } = prisma.notification.createMany.mock.calls[0][0];
    expect(data.map((n: { userId: string }) => n.userId)).toEqual(["admin-1", "admin-2"]);
    expect(data[0]).toMatchObject({
      type: "PROPERTY_REQUEST_CREATED",
      title: "New purchase request",
      body: "John Doe wants to buy Lekki Apartment.",
      notificationStatus: "SENT",
      meta: expect.objectContaining({ channel: "in_app", propertyRequestId: "r1" }),
    });
    expect(appEvents.emit).toHaveBeenCalledWith("PROPERTY_REQUEST_CREATED", {
      propertyRequestId: "r1",
    });
  });

  it("still creates the request when the notification fails", async () => {
    prisma.notification.createMany.mockRejectedValue(new Error("db down"));

    const result = await createPropertyRequest("u1", "p1", "CONSULTATION");

    expect(result).toMatchObject({ created: true, request: { id: "r1" } });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Could not send PROPERTY_REQUEST_CREATED notifications"),
    );
  });

  it("doesn't notify anyone about an existing open request", async () => {
    prisma.propertyRequest.findFirst.mockResolvedValue({ id: "r0" });
    await createPropertyRequest("u1", "p1", "PURCHASE");
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(appEvents.emit).not.toHaveBeenCalled();
  });
});
