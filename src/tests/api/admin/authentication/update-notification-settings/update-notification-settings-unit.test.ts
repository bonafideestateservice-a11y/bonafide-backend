import { NextFunction, Request, Response } from "express";
import { updateNotificationSettings } from "../../../../../api/admin/authentication/handlers/update-notification-settings";
import { updateNotificationSettings as updateSettings } from "../../../../../api/services/database/notifications";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/services/database/notifications");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedUpdateSettings = updateSettings as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}) {
  const req = { user: { id: "admin-1" }, body } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("admin notification settings handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("updates the supplied notification settings", async () => {
    const settings = { userId: "admin-1", email: true, sms: false, push: true };
    mockedUpdateSettings.mockResolvedValue(settings);
    const { req, res, next } = buildMockReqRes({ email: true, sms: false, push: true });

    await updateNotificationSettings(req, res, next);

    expect(mockedUpdateSettings).toHaveBeenCalledWith("admin-1", {
      email: true,
      sms: false,
      push: true,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(settings);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    const { req, res, next } = buildMockReqRes();

    await updateNotificationSettings(req, res, next);

    expect(mockedUpdateSettings).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });

  it("rejects non-boolean settings", async () => {
    const { req, res, next } = buildMockReqRes({ push: 1 });

    await updateNotificationSettings(req, res, next);

    expect(mockedUpdateSettings).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });
});
