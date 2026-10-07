import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getPropertyDetail } from "../../services/database/property";
import { toPropertyResponse } from "../get-all-properties/get-all-properties.v1";

/** The admin Property Details page. */
export const getPropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const property = await getPropertyDetail(req.params.id);
    if (!property) return next(new NotFoundError("Property not found."));
    res.status(HttpStatusCode.OK).json({
      ...toPropertyResponse(property),
      status: property.status,
      verifiedAt: property.verifiedAt?.toISOString() ?? null,
      updatedAt: property.updatedAt.toISOString(),
      agent: property.agent,
      stats: {
        views: property.viewCount,
        inquiries: property._count.inquiries,
        favorites: property._count.favorites,
      },
    });
  } catch (error) {
    logger.error(`Error getting property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
