import { NextFunction, Request, Response } from "express";
import getAllActivities from "../../../../../api/admin/dashboard/handlers/get-all-activities";
import { getAllActivities as getAllActivitiesFromDatabase } from "../../../../../api/admin/dashboard/services/database/activities";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/dashboard/services/database/activities");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAllActivities = getAllActivitiesFromDatabase as jest.Mock;

describe("getAllActivities handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns sent notification activities", async () => {
    const activities = [
      {
        id: "notification-1",
        type: "VERIFICATION_REQUEST_CREATED",
        channel: "in_app",
        title: "Verification request created",
        body: "Your verification request was created.",
        clientName: "Client User",
        createdAt: new Date(),
        sentAt: new Date(),
        meta: { channel: "in_app", clientName: "Client User" },
      },
    ];
    mockedGetAllActivities.mockResolvedValue(activities);
    const req = {} as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await getAllActivities(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({ activities });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards database errors", async () => {
    mockedGetAllActivities.mockRejectedValue(new Error("DB exploded"));
    const req = {} as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await getAllActivities(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
