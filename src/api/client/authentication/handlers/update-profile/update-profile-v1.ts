import { NextFunction, Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getClientProfile, updateClientProfile } from "../../services/database/client";
import { logger } from "../../../../../utils/logger";

type ProfileRequest = Request & { file?: Express.Multer.File };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));

    const body = req.body as {
      fullName?: unknown;
      phone?: unknown;
      location?: unknown;
      countryCode?: unknown;
    };
    const file = (req as ProfileRequest).file;
    const data: {
      fullName?: string;
      phone?: string | null;
      location?: string | null;
      countryCode?: string | null;
      profilePhoto?: string;
    } = {};

    if (body.fullName !== undefined) {
      if (typeof body.fullName !== "string" || !body.fullName.trim()) {
        return next(new BadRequestError("Full name must be a non-empty string."));
      }
      data.fullName = body.fullName.trim();
    }
    if (body.phone !== undefined) {
      if (typeof body.phone !== "string")
        return next(new BadRequestError("Phone must be a string."));
      data.phone = body.phone.trim() || null;
    }
    if (body.location !== undefined) {
      if (typeof body.location !== "string") {
        return next(new BadRequestError("Location must be a string."));
      }
      data.location = body.location.trim() || null;
    }
    if (body.countryCode !== undefined) {
      if (typeof body.countryCode !== "string") {
        return next(
          new BadRequestError("Country code must be a two-letter ISO 3166-1 alpha-2 code."),
        );
      }
      const countryCode = body.countryCode.trim();
      if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) {
        return next(
          new BadRequestError("Country code must be a two-letter ISO 3166-1 alpha-2 code."),
        );
      }
      data.countryCode = countryCode ? countryCode.toUpperCase() : null;
    }
    if (file) {
      const fileType = file.mimetype || "application/octet-stream";
      const upload = await cloudinary.uploader.upload(
        `data:${fileType};base64,${file.buffer.toString("base64")}`,
        {
          folder: process.env.CLOUDINARY_FOLDER || "bonafide-services/profile-photos",
          resource_type: "image",
        },
      );
      data.profilePhoto = upload.secure_url;
    }
    if (!Object.keys(data).length) return next(new BadRequestError("No profile changes provided."));

    const current = await getClientProfile(userId);
    if (!current) return next(new NotFoundError("Profile not found."));
    const profile = await updateClientProfile(userId, data);
    res.status(HttpStatusCode.OK).json(profile);
  } catch (error) {
    logger.error(`Error updating client profile: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default updateProfile;
