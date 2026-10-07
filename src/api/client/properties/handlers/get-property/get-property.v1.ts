import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { extractTokenFromHeaders, verifyToken } from "../../../../../utils/jwt";
import { toPropertyResponse } from "../../../../admin/dashboard/handlers/get-all-properties/get-all-properties.v1";
import { isPropertyFavorite, viewProperty } from "../../services/database/property";

/** The signed-in user's ID when a valid token is sent; this endpoint is public. */
const optionalUserId = async (req: Request) => {
  const token = extractTokenFromHeaders(req);
  if (!token) return undefined;
  return verifyToken(token).then(
    (payload) => payload.id as string | undefined,
    () => undefined,
  );
};

/** The public Property Details page. Every call counts as a view. */
export const getPropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const property = await viewProperty(req.params.id);
    const userId = await optionalUserId(req);
    res.status(HttpStatusCode.OK).json({
      ...toPropertyResponse(property),
      status: property.status,
      verifiedAt: property.verifiedAt?.toISOString() ?? null,
      isFavorite: userId ? await isPropertyFavorite(userId, property.id) : false,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return next(new NotFoundError("Property not found."));
    }
    logger.error(`Error getting property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
