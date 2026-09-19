import { NextFunction, Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import type { Express } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { findVerificationRequest } from "../../services/database/verification-request";
import { createDocument } from "../../services/database/documents";
import { logger } from "../../../../../utils/logger";

type UploadRequest = Request & { file?: Express.Multer.File };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

export const postVerificationDocuments = async (
  req: UploadRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;

    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const verificationRequestId = req.params.id;
    if (!verificationRequestId?.trim()) {
      return next(new BadRequestError("Verification request id is required."));
    }

    if (!req.file) {
      return next(new BadRequestError("A file is required."));
    }

    const verificationRequest = await findVerificationRequest({
      id: verificationRequestId,
    });

    if (!verificationRequest) {
      return next(new NotFoundError("Verification request not found."));
    }

    if (verificationRequest.userId !== userId) {
      return next(new ForbiddenError("You cannot upload to this request."));
    }

    const fileType = req.file.mimetype || "application/octet-stream";
    const isPdf = fileType.toLowerCase() === "application/pdf";
    const uploadResult = await cloudinary.uploader.upload(
      `data:${fileType};base64,${req.file.buffer.toString("base64")}`,
      {
        folder: process.env.CLOUDINARY_FOLDER || "bonafide-services/verification-documents",
        resource_type: isPdf ? "raw" : "image",
      },
    );

    const document = await createDocument({
      verificationRequestId,
      url: uploadResult.secure_url,
      fileName: req.file.originalname,
      fileType,
      fileSizeBytes: req.file.size,
    });

    res.status(HttpStatusCode.CREATED).json({
      id: document.id,
      url: document.url,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSizeBytes: document.fileSizeBytes,
    });
  } catch (error) {
    logger.error(`Error uploading verification document: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default postVerificationDocuments;
