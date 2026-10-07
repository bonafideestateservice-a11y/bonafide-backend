import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getClientProfile } from "../../services/database/user";

/** The User Profile page for a client. */
export const getUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const profile = await getClientProfile(req.params.id);
    if (!profile) return next(new NotFoundError("Client not found."));
    const { user, stats, recentActivity } = profile;
    res.status(HttpStatusCode.OK).json({
      id: user.id,
      name: user.fullName,
      email: user.email,
      phone: user.phone,
      location: user.location,
      avatarUrl: user.profilePhoto,
      status: user.status,
      memberSince: user.createdAt.toISOString(),
      stats,
      recentActivity,
    });
  } catch (error) {
    logger.error(`Error getting client profile: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
