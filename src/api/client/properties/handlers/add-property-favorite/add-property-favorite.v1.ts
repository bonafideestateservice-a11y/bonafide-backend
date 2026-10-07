import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { addPropertyFavorite, isPropertyVisible } from "../../services/database/property";

/** Adds a published property to the user's favorites. Repeating it changes nothing. */
export const addPropertyFavoriteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!(await isPropertyVisible(req.params.id))) throw new NotFoundError("Property not found.");
    await addPropertyFavorite((req as CustomRequest).user?.id as string, req.params.id);
    res.status(HttpStatusCode.OK).json({ propertyId: req.params.id, isFavorite: true });
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    logger.error(`Error adding property favorite: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
