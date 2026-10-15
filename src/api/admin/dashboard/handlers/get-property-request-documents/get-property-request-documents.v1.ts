import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { propertyRequestExists } from "../../../../services/database/property-request";
import { getGroupedDocuments } from "../../../../services/property-documents";

/** A request's documents: those Bonafide shared and those the client submitted. */
export const getPropertyRequestDocumentsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!(await propertyRequestExists(req.params.id))) {
      return next(new NotFoundError("Property request not found."));
    }
    res.status(HttpStatusCode.OK).json(await getGroupedDocuments(req.params.id));
  } catch (error) {
    logger.error(`Error listing purchase documents for admin: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
