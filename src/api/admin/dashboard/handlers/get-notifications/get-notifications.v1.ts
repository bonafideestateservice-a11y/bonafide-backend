import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import {
  getInAppNotifications,
  markInAppNotificationsRead,
} from "../../../../services/database/notifications";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";

const userIdOf = (req: Request) => (req as CustomRequest).user!.id;

/** The signed-in admin's notification inbox (the bell). */
export const getNotificationsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const paging = parsePaging(req.query);
  if (!paging)
    return next(new BadRequestError("page and limit must be positive integers (limit ≤ 100)."));
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    res
      .status(HttpStatusCode.OK)
      .json(await getInAppNotifications(userIdOf(req), { ...paging, unreadOnly }));
  } catch (error) {
    logger.error(`Error getting notifications: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export const markNotificationReadHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { count } = await markInAppNotificationsRead(userIdOf(req), req.params.id);
    if (count === 0) return next(new NotFoundError("Notification not found."));
    res.status(HttpStatusCode.OK).json({ id: req.params.id, read: true });
  } catch (error) {
    logger.error(`Error marking notification read: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export const markAllNotificationsReadHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { count } = await markInAppNotificationsRead(userIdOf(req));
    res.status(HttpStatusCode.OK).json({ updated: count });
  } catch (error) {
    logger.error(`Error marking notifications read: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
