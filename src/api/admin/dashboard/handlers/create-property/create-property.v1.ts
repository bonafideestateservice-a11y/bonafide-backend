import { PropertyAmenity, PropertyType } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  createProperty,
  CreatePropertyData,
  UpdatePropertyData,
} from "../../services/database/property";
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

/** Uploads the form's photos; `cover` is undefined when no new cover was sent. */
export const uploadPropertyImages = async (req: Request) => {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const [cover, images] = await Promise.all([
    files.coverImage ? uploadImage(files.coverImage[0]) : undefined,
    Promise.all((files.images ?? []).map(uploadImage)),
  ]);
  return { cover, images };
};

/** Optional whole or decimal number from a form field; undefined when blank. */
const numberField = (value: unknown, name: string, integer: boolean) => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new BadRequestError(`${name} must be a ${integer ? "whole " : ""}number of 0 or more.`);
  }
  return parsed;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Validates the Add/Edit Property form. On edit (`partial`), fields that aren't sent are
 * left unchanged; a field sent blank clears it.
 */

export const parsePropertyForm = (body: Record<string, unknown>, partial: boolean) => {
  const sent = (field: string) => body[field] !== undefined;
  const required = (field: string) => !partial || sent(field);
  const data: UpdatePropertyData = {};

  if (required("title")) {
    data.name = text(body.title);
    if (!data.name) throw new BadRequestError("title is required.");
  }
  if (required("propertyType")) {
    if (!Object.values(PropertyType).includes(body.propertyType as PropertyType)) {
      throw new BadRequestError("propertyType must be RESIDENTIAL, COMMERCIAL or LAND.");
    }
    data.propertyType = body.propertyType as PropertyType;
  }
  if (required("priceAmount")) {
    const price = numberField(body.priceAmount, "priceAmount", true);
    if (price === undefined) throw new BadRequestError("priceAmount is required.");
    data.priceAmount = BigInt(price);
  }
  if (required("location")) {
    const location = text(body.location);
    if (!location) throw new BadRequestError("location is required.");
    // "Lekki Phase 1, Lagos": the part after the last comma is the city.
    const comma = location.lastIndexOf(",");
    data.address = location;
    data.area = comma === -1 ? location : location.slice(0, comma).trim();
    data.city = comma === -1 ? null : location.slice(comma + 1).trim();
  }
  if (sent("description")) data.description = text(body.description) || null;
  if (sent("bedrooms")) data.bedrooms = numberField(body.bedrooms, "bedrooms", true) ?? null;
  if (sent("bathrooms")) data.bathrooms = numberField(body.bathrooms, "bathrooms", true) ?? null;
  if (sent("sizeSqm")) data.sizeSqm = numberField(body.sizeSqm, "sizeSqm", false) ?? null;
  if (sent("yearBuilt")) data.yearBuilt = numberField(body.yearBuilt, "yearBuilt", true) ?? null;
  if (sent("amenities")) {
    // A single blank value clears the list.
    const amenities = ([] as unknown[]).concat(body.amenities).filter((a) => a !== "");
    const badAmenity = amenities.find(
      (a) => !Object.values(PropertyAmenity).includes(a as PropertyAmenity),
    );
    if (badAmenity !== undefined) throw new BadRequestError(`Unknown amenity: ${badAmenity}.`);
    data.amenities = amenities as PropertyAmenity[];
  }
  if (required("isPublished"))
    data.isPublished = body.isPublished === true || body.isPublished === "true";
  return data;
};

/** "Save as Draft" (isPublished false) or "Save & Publish" (true) on the Add Property form. */
export const createPropertyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = parsePropertyForm(req.body ?? {}, false);
    const { cover, images } = await uploadPropertyImages(req);
    const property = await createProperty({
      ...(data as CreatePropertyData),
      coverImageUrl: cover ?? null,
      imageUrls: images,
    });
    res.status(HttpStatusCode.CREATED).json(toPropertyResponse(property));
  } catch (error) {
    if (error instanceof BadRequestError) return next(error);
    logger.error(`Error creating property: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
