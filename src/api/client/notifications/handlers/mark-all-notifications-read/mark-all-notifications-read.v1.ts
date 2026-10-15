import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { logger } from "../../../../../utils/logger";
import { markInAppNotificationsRead } from "../../../../services/database/notifications";

/** Marks all of the client's unread notifications as read. */
export const markAllClientNotificationsReadHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id as string;
    const { count } = await markInAppNotificationsRead(userId);
    res.status(HttpStatusCode.OK).json({ updated: count });
  } catch (error) {
    logger.error(`Error marking client notifications read: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
