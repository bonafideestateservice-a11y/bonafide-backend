import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";
import { getClientUpdates } from "../../services/database/notifications";

/** The client's Updates screen. */
export const getClientNotificationsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const paging = parsePaging(req.query);
  if (!paging) {
    return next(new BadRequestError("page and limit must be positive integers (limit ≤ 100)."));
  }
  try {
    const userId = (req as CustomRequest).user?.id as string;
    const unreadOnly = req.query.unreadOnly === "true";
    res.status(HttpStatusCode.OK).json(await getClientUpdates(userId, { ...paging, unreadOnly }));
  } catch (error) {
    logger.error(`Error getting client notifications: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
