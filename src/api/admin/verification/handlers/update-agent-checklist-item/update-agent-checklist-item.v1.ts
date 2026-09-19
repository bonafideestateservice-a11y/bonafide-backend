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
import {
  updateAgentChecklistItem,
  ChecklistMediaData,
} from "../../services/database/agent-assignment";
import { logger } from "../../../../../utils/logger";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

export const updateAgentChecklistItemHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const status = req.body.status ?? "PENDING";
    if (status !== "PENDING" && status !== "COMPLETE") {
      return next(new BadRequestError("Status must be PENDING or COMPLETE."));
    }

    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));

    const files = Array.isArray(req.files) ? req.files : (req.files?.media ?? []);
    const media = await Promise.all(
      files.map(async (file): Promise<ChecklistMediaData> => {
        const fileType = file.mimetype || "application/octet-stream";
        const uploadResult = await cloudinary.uploader.upload(
          `data:${fileType};base64,${file.buffer.toString("base64")}`,
          {
            folder: process.env.CLOUDINARY_FOLDER || "bonafide-services/verification-checklist",
            resource_type: fileType === "application/pdf" ? "raw" : "image",
          },
        );
        return {
          url: uploadResult.secure_url,
          fileName: file.originalname,
          fileType,
          fileSizeBytes: file.size,
        };
      }),
    );

    const item = await updateAgentChecklistItem(
      agent.id,
      req.params.id,
      req.params.itemId,
      status,
      media,
    );
    if (!item) return next(new NotFoundError("Checklist item not found."));

    res.status(HttpStatusCode.OK).json(item);
  } catch (error) {
    logger.error(`Error updating agent checklist item: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default updateAgentChecklistItemHandler;
