import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { setPropertyAgent } from "../../services/database/property";

/** Removes the property's agent. Repeating it changes nothing. */
export const unassignPropertyAgentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const property = await setPropertyAgent(req.params.id, null);
    res
      .status(HttpStatusCode.OK)
      .json({ ...property, updatedAt: property.updatedAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return next(new NotFoundError("Property not found."));
    }
    logger.error(`Error unassigning property agent: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
