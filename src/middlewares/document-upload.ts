import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError, BadRequestError } from "../exceptions";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (_req, file, done) =>
    ALLOWED_TYPES.includes(file.mimetype)
      ? done(null, true)
      : done(new BadRequestError("Documents must be PDF, JPG or PNG.")),
}).single("file");

/** One purchase document in the `file` form field: PDF, JPG or PNG, up to 10 MB. */
export const documentUpload = (req: Request, res: Response, next: NextFunction) =>
  upload(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof ApiError) return next(error);
    const tooBig = (error as { code?: string }).code === "LIMIT_FILE_SIZE";
    next(
      new BadRequestError(tooBig ? "Documents must be at most 10 MB." : (error as Error).message),
    );
  });
