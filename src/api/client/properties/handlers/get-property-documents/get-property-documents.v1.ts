import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { propertyRequestExists } from "../../../../services/database/property-request";
import { getGroupedDocuments } from "../../../../services/property-documents";
import { userIdOf } from "../shared";

/** "Legal Documentation": documents shared by Bonafide and those the client submitted. */
export const getPropertyDocumentsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!(await propertyRequestExists(req.params.id, userIdOf(req)))) {
      return next(new NotFoundError("Purchase request not found."));
    }
    res.status(HttpStatusCode.OK).json(await getGroupedDocuments(req.params.id));
  } catch (error) {
    logger.error(`Error listing purchase documents: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
