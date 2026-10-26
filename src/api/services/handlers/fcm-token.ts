import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../exceptions";
import { CustomRequest } from "../../../middlewares/check-jwt";
import { logger } from "../../../utils/logger";
import { deactivateFcmTokenForUser, saveFcmTokenForUser } from "../database/fcm-token";

// Handlers shared by the client and admin routers (registered behind checkJwt).

const MAX_TOKEN_LENGTH = 4096;

/** The trimmed FCM token, null when absent, or undefined when invalid. */
const readFcmToken = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > MAX_TOKEN_LENGTH) {
    return undefined;
  }
  return value.trim();
};

/** Saves the browser's FCM token so push notifications reach the logged-in user. */
export const registerFcmTokenHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const fcmToken = readFcmToken(req.body?.fcmToken);
  if (!fcmToken) return next(new BadRequestError("fcmToken is required."));

  const userId = (req as CustomRequest).user!.id;
  try {
    await saveFcmTokenForUser(userId, fcmToken);
    res.status(HttpStatusCode.OK).json({ message: "FCM token saved." });
  } catch (error) {
    logger.error(`Error saving FCM token: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

/**
 * Logout. JWTs are stateless, so the app discards its token; this stops push notifications to
 * the browser whose FCM token is sent.
 */
export const logoutHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const fcmToken = readFcmToken(req.body?.fcmToken);
  if (fcmToken === undefined) return next(new BadRequestError("fcmToken must be a string."));

  const userId = (req as CustomRequest).user!.id;
  try {
    if (fcmToken) await deactivateFcmTokenForUser(userId, fcmToken);
    logger.info(`User logged out userId=${userId}`);
    res.status(HttpStatusCode.OK).json({ message: "Logged out." });
  } catch (error) {
    logger.error(`Error during logout: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
