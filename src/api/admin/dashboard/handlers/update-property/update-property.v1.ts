import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { findProperty, updateProperty } from "../../services/database/property";
import { parsePropertyForm, uploadPropertyImages } from "../create-property/create-property.v1";
import { toPropertyResponse } from "../get-all-properties/get-all-properties.v1";

const MAX_IMAGES = 4;

/** Edit Property: send only the fields that changed. */
export const updatePropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body ?? {};
    const data = parsePropertyForm(body, true);
    const removeImageUrls = ([] as unknown[]).concat(body.removeImageUrls ?? []);
    const current = await findProperty(req.params.id);
    if (!current) throw new NotFoundError("Property not found.");

    const kept = current.imageUrls.filter((url) => !removeImageUrls.includes(url));
    const added = ((req.files ?? {}) as Record<string, Express.Multer.File[]>).images ?? [];
    if (kept.length + added.length > MAX_IMAGES) {
      throw new BadRequestError(`A property can have at most ${MAX_IMAGES} other images.`);
    }
    const { cover, images } = await uploadPropertyImages(req);
    const coverRemoved = removeImageUrls.includes(current.coverImageUrl);
    const property = await updateProperty(current.id, {
      ...data,
      coverImageUrl: cover ?? (coverRemoved ? null : current.coverImageUrl),
      imageUrls: [...kept, ...images],
    });
    res.status(HttpStatusCode.OK).json(toPropertyResponse(property));
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return next(new NotFoundError("Property not found."));
    }
    logger.error(`Error updating property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
