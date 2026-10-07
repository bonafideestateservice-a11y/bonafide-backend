import { PropertyAmenity, PropertyType } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { createProperty } from "../../services/database/property";
import { toPropertyResponse } from "../get-all-properties/get-all-properties.v1";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, done) =>
    ["image/png", "image/jpeg"].includes(file.mimetype)
      ? done(null, true)
      : done(new BadRequestError("Images must be PNG or JPEG.")),
}).fields([
  { name: "coverImage", maxCount: 1 },
  { name: "images", maxCount: 4 },
]);

/** Multer for the Add Property form; its errors (size, count, type) are 400s. */
export const propertyImagesUpload = (req: Request, res: Response, next: NextFunction) =>
  upload(req, res, (error: unknown) => {
    if (!error) return next();
    next(error instanceof ApiError ? error : new BadRequestError((error as Error).message));
  });

const uploadImage = async (file: Express.Multer.File) =>
  (
    await cloudinary.uploader.upload(
      `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
      { folder: "bonafide-services/properties", resource_type: "image" },
    )
  ).secure_url;

/** Optional whole or decimal number from a form field; undefined when blank. */
const numberField = (value: unknown, name: string, integer: boolean) => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new BadRequestError(`${name} must be a ${integer ? "whole " : ""}number of 0 or more.`);
  }
  return parsed;
};

/** "Save as Draft" (isPublished false) or "Save & Publish" (true) on the Add Property form. */
export const createPropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body ?? {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const price = numberField(body.priceAmount, "priceAmount", true);
    const amenities = ([] as unknown[]).concat(body.amenities ?? []);
    if (!title) throw new BadRequestError("title is required.");
    if (!Object.values(PropertyType).includes(body.propertyType)) {
      throw new BadRequestError("propertyType must be RESIDENTIAL, COMMERCIAL or LAND.");
    }
    if (price === undefined) throw new BadRequestError("priceAmount is required.");
    if (!location) throw new BadRequestError("location is required.");
    const badAmenity = amenities.find(
      (a) => !Object.values(PropertyAmenity).includes(a as PropertyAmenity),
    );
    if (badAmenity !== undefined) throw new BadRequestError(`Unknown amenity: ${badAmenity}.`);

    // "Lekki Phase 1, Lagos": the part after the last comma is the city.
    const comma = location.lastIndexOf(",");
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const [coverImageUrl, imageUrls] = await Promise.all([
      files.coverImage ? uploadImage(files.coverImage[0]) : null,
      Promise.all((files.images ?? []).map(uploadImage)),
    ]);
    const property = await createProperty({
      name: title,
      address: location,
      area: comma === -1 ? location : location.slice(0, comma).trim(),
      city: comma === -1 ? null : location.slice(comma + 1).trim(),
      propertyType: body.propertyType,
      priceAmount: BigInt(price),
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      bedrooms: numberField(body.bedrooms, "bedrooms", true),
      bathrooms: numberField(body.bathrooms, "bathrooms", true),
      sizeSqm: numberField(body.sizeSqm, "sizeSqm", false),
      yearBuilt: numberField(body.yearBuilt, "yearBuilt", true),
      amenities: amenities as PropertyAmenity[],
      coverImageUrl,
      imageUrls,
      isPublished: body.isPublished === true || body.isPublished === "true",
    });
    res.status(HttpStatusCode.CREATED).json(toPropertyResponse(property));
  } catch (error) {
    if (error instanceof BadRequestError) return next(error);
    logger.error(`Error creating property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
