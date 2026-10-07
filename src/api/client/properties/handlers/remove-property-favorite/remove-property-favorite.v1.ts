import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { removePropertyFavorite } from "../../services/database/property";

/** Removes a property from the user's favorites. Repeating it changes nothing. */
export const removePropertyFavoriteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await removePropertyFavorite((req as CustomRequest).user?.id as string, req.params.id);
    res.status(HttpStatusCode.OK).json({ propertyId: req.params.id, isFavorite: false });
  } catch (error) {
    logger.error(`Error removing property favorite: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
