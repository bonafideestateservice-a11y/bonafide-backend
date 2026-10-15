import { getClientNotificationsHandler } from "../../../../../api/client/notifications/handlers/get-notifications";
import {
  getClientUpdates,
  toClientUpdate,
} from "../../../../../api/client/notifications/services/database/notifications";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/notifications/services/database/notifications", () => ({
  ...jest.requireActual("../../../../../api/client/notifications/services/database/notifications"),
  getClientUpdates: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetUpdates = getClientUpdates as jest.Mock;
const createdAt = new Date("2026-10-08T14:00:00.000Z");
const row = (overrides: object) => ({
  id: "n1",
  type: "AGENT_ASSIGNED",
  title: "Agent assigned",
  body: "An agent has been assigned to your Property Verification verification.",
  meta: { channel: "in_app", agentName: "Sarah Johnson", agentId: "a1" },
  read: false,
  verificationRequestId: "r1",
  createdAt,
  verificationType: { name: "Property Verification", slug: "property-verification" },
  verificationRequest: { details: { propertyName: "Lekki Phase 1 Apartment" } },
  ...overrides,
});

describe("getClientNotificationsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the client's updates", async () => {
    const page = { data: [], unreadCount: 0, meta: { page: 2, limit: 5 } };
    mockedGetUpdates.mockResolvedValue(page);

    const { res } = await callHandler(getClientNotificationsHandler, {
      user: { id: "user-1" },
      query: { page: "2", limit: "5", unreadOnly: "true" },
    });

    expect(mockedGetUpdates).toHaveBeenCalledWith("user-1", {
      page: 2,
      limit: 5,
      unreadOnly: true,
    });
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it.each([[{ page: "0" }], [{ limit: "101" }]])("returns 400 for paging %j", async (query) => {
    const { next } = await callHandler(getClientNotificationsHandler, { user: { id: "u" }, query });
    expect(errorStatus(next)).toBe(400);
    expect(mockedGetUpdates).not.toHaveBeenCalled();
  });

  it("returns 500 when the query fails", async () => {
    mockedGetUpdates.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getClientNotificationsHandler, { user: { id: "u" } });
    expect(errorStatus(next)).toBe(500);
  });
});

describe("toClientUpdate (unit)", () => {
  it("words an agent assignment like the Updates screen", () => {
    expect(toClientUpdate(row({}) as never)).toEqual({
      id: "n1",
      type: "AGENT_ASSIGNED",
      title: "New Agent Assigned",
      body: "Sarah Johnson has been assigned to your Lekki Phase 1 Apartment verification",
      verificationType: { name: "Property Verification", slug: "property-verification" },
      subjectName: "Lekki Phase 1 Apartment",
      verificationRequestId: "r1",
      propertyRequestId: null,
      reportId: null,
      read: false,
      createdAt,
    });
  });

  it("words a ready report and returns its report id", () => {
    const update = toClientUpdate(
      row({
        type: "REPORT_UPLOADED",
        meta: { channel: "in_app", reportId: "rep-1" },
        verificationType: { name: "Business Verification", slug: "business-verification" },
        verificationRequest: { details: { businessName: "Tech Startup Ltd" } },
      }) as never,
    );
    expect(update).toMatchObject({
      title: "Business Verification Complete",
      body: "Your business verification report for Tech Startup Ltd is ready",
      reportId: "rep-1",
    });
  });

  it.each([
    [
      "VERIFICATION_REQUEST_CREATED",
      "Verification Request Submitted",
      "Your property verification request for 12 Admiralty Way has been submitted",
    ],
    [
      "INSPECTION_STARTED",
      "Inspection Started",
      "Inspection has started for your 12 Admiralty Way verification",
    ],
  ])("words %s", (type, title, body) => {
    const update = toClientUpdate(
      row({
        type,
        verificationRequest: { details: { propertyAddress: "12 Admiralty Way" } },
      }) as never,
    );
    expect(update).toMatchObject({ title, body, subjectName: "12 Admiralty Way" });
  });

  it("keeps the stored wording for payments, which includes the amount", () => {
    const update = toClientUpdate(
      row({
        type: "PAYMENT_RECEIVED",
        title: "Payment received",
        body: "Your payment of NGN 75000 was received.",
      }) as never,
    );
    expect(update).toMatchObject({
      title: "Payment received",
      body: "Your payment of NGN 75000 was received.",
    });
  });

  it("falls back to the verification type when the request has no name or address", () => {
    const update = toClientUpdate(
      row({ meta: { channel: "in_app" }, verificationRequest: { details: {} } }) as never,
    );
    expect(update).toMatchObject({
      subjectName: null,
      body: "An agent has been assigned to your property verification verification",
    });
  });
});
