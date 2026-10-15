import { PropertyDocumentSource } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { propertyRequestExists } from "../../../../services/database/property-request";
import { saveDocument } from "../../../../services/property-documents";

/** An admin shares a document with the client ("Available documents"). */
export const sharePropertyDocumentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!(await propertyRequestExists(req.params.id))) {
      return next(new NotFoundError("Property request not found."));
    }
    const document = await saveDocument(
      req.params.id,
      PropertyDocumentSource.BONAFIDE,
      req.file,
      req.body?.name,
    );
    res.status(HttpStatusCode.CREATED).json(document);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    logger.error(`Error sharing purchase document: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to upload the document."));
  }
};
