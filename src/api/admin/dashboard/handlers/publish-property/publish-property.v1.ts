import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { publishProperty } from "../../services/database/property";
import { logger } from "../../../../../utils/logger";

export const publishPropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const property = await publishProperty(req.params.id);
    res.status(HttpStatusCode.OK).json({
      id: property.id,
      isPublished: property.isPublished,
      updatedAt: property.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return next(new NotFoundError("Property not found."));
    }
    logger.error(`Error publishing property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default publishPropertyHandler;
