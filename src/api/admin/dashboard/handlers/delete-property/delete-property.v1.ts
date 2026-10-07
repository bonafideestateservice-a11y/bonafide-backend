import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { deleteProperty } from "../../services/database/property";

/** Soft delete: the property disappears from every list and page but the row is kept. */
export const deletePropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const property = await deleteProperty(req.params.id);
    res.status(HttpStatusCode.OK).json({ id: property.id, deleted: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return next(new NotFoundError("Property not found."));
    }
    logger.error(`Error deleting property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
