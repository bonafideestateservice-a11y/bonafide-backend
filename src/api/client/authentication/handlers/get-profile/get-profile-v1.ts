import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getClientProfile } from "../../services/database/client";
import { logger } from "../../../../../utils/logger";

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    const profile = await getClientProfile(userId);
    if (!profile) return next(new NotFoundError("Profile not found."));
    res.status(HttpStatusCode.OK).json(profile);
  } catch (error) {
    logger.error(`Error getting client profile: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getProfile;
