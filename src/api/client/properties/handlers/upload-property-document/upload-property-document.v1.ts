import { PropertyDocumentSource } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { propertyRequestExists } from "../../../../services/database/property-request";
import { saveDocument } from "../../../../services/property-documents";
import { userIdOf } from "../shared";

/** "Choose document to upload": the client adds a document to "Submitted documents". */
export const uploadPropertyDocumentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!(await propertyRequestExists(req.params.id, userIdOf(req)))) {
      return next(new NotFoundError("Purchase request not found."));
    }
    const document = await saveDocument(
      req.params.id,
      PropertyDocumentSource.CLIENT,
      req.file,
      req.body?.name,
    );
    res.status(HttpStatusCode.CREATED).json(document);
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    logger.error(`Error uploading purchase document: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to upload the document."));
  }
};
