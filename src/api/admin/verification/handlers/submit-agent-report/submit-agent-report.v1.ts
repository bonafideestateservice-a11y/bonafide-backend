import { NextFunction, Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { submitAgentAssignmentReport } from "../../services/database/verification-report";
import { logger } from "../../../../../utils/logger";

type UploadRequest = Request & { file?: Express.Multer.File };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

export const submitAgentReport = async (
  req: UploadRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  let uploadedPublicId: string | undefined;
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const file = req.file;
    if (!file) {
      return next(new BadRequestError("A PDF report_document file is required."));
    }
    if (
      file.mimetype.toLowerCase() !== "application/pdf" ||
      !file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
    ) {
      return next(new BadRequestError("report_document must be a valid PDF file."));
    }

    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));

    const uploadResult = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${file.buffer.toString("base64")}`,
      {
        folder: process.env.CLOUDINARY_REPORTS_FOLDER || "bonafide-services/verification-reports",
        resource_type: "raw",
      },
    );
    uploadedPublicId = uploadResult.public_id;

    const result = await submitAgentAssignmentReport(agent.id, req.params.id, {
      url: uploadResult.secure_url,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSizeBytes: file.size,
    });

    if (!result || result.kind === "INCOMPLETE_CHECKLIST") {
      await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: "raw" });
      uploadedPublicId = undefined;
    }

    if (!result) return next(new NotFoundError("Assignment not found."));
    if (result.kind === "INCOMPLETE_CHECKLIST") {
      res.status(HttpStatusCode.CONFLICT).json({
        error: result.kind,
        progressPercent: result.progressPercent,
        remainingItems: result.remainingItems,
      });
      return;
    }

    res.status(HttpStatusCode.CREATED).json({
      id: result.id,
      reviewStatus: result.reviewStatus,
      generatedAt: result.generatedAt.toISOString(),
      reportDocument: result.reportDocument,
    });
  } catch (error) {
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: "raw" });
      } catch (cleanupError) {
        logger.error(`Error cleaning up uploaded report document ${cleanupError}`);
      }
    }
    logger.error(`Error submitting agent report: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default submitAgentReport;
