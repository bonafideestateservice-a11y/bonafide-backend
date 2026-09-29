import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { updateNotificationSettings as updateSettings } from "../../../../services/database/notifications";
import { logger } from "../../../../../utils/logger";

export const updateNotificationSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));

    const body = req.body as { email?: unknown; sms?: unknown; push?: unknown };
    const data: { email?: boolean; sms?: boolean; push?: boolean } = {};
    for (const key of ["email", "sms", "push"] as const) {
      const value = body[key];
      if (value !== undefined) {
        if (typeof value !== "boolean") {
          return next(new BadRequestError(`${key} must be a boolean.`));
        }
        data[key] = value;
      }
    }
    if (!Object.keys(data).length) {
      return next(new BadRequestError("At least one notification setting must be provided."));
    }

    const settings = await updateSettings(userId, data);
    if (!settings) return next(new NotFoundError("Profile not found."));
    res.status(HttpStatusCode.OK).json(settings);
  } catch (error) {
    logger.error(`Error updating admin notification settings: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default updateNotificationSettings;
