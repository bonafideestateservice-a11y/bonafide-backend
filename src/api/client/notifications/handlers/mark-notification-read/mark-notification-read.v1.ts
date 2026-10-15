import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { logger } from "../../../../../utils/logger";
import { markInAppNotificationsRead } from "../../../../services/database/notifications";

/** Marks one of the client's notifications as read. */
export const markClientNotificationReadHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id as string;
    const { count } = await markInAppNotificationsRead(userId, req.params.id);
    if (count === 0) return next(new NotFoundError("Notification not found."));
    res.status(HttpStatusCode.OK).json({ id: req.params.id, read: true });
  } catch (error) {
    logger.error(`Error marking client notification read: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
