import { NextFunction, Request, Response } from "express";
import { PropertyType } from "@prisma/client";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import {
  getAllProperties,
  PropertyListStatus,
  PropertySortBy,
  PropertySortOrder,
} from "../../services/database/property";
import { logger } from "../../../../../utils/logger";

const statuses: PropertyListStatus[] = ["all", "published", "unpublished"];
const types: PropertyType[] = ["RESIDENTIAL", "COMMERCIAL", "LAND"];
const sortFields: PropertySortBy[] = ["createdAt", "price"];
const sortOrders: PropertySortOrder[] = ["asc", "desc"];

const parsePositiveInteger = (value: unknown, name: string, defaultValue: number): number => {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestError(`${name} must be a positive integer.`);
  }
  return parsed;
};

const getStringQuery = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new BadRequestError(`${name} must be a string.`);
  return value;
};

export const getAllPropertiesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const status = getStringQuery(req.query.status, "status") ?? "all";
    const search = getStringQuery(req.query.search, "search") ?? "";
    const type = getStringQuery(req.query.type, "type");
    const sortBy = getStringQuery(req.query.sortBy, "sortBy") ?? "createdAt";
    const sortOrder = getStringQuery(req.query.sortOrder, "sortOrder") ?? "desc";
    const page = parsePositiveInteger(req.query.page, "page", 1);
    const limit = parsePositiveInteger(req.query.limit, "limit", 12);

    if (!statuses.includes(status as PropertyListStatus)) {
      throw new BadRequestError("status must be all, published, or unpublished.");
    }
    if (type !== undefined && !types.includes(type as PropertyType)) {
      throw new BadRequestError("type must be RESIDENTIAL, COMMERCIAL, or LAND.");
    }
    if (!sortFields.includes(sortBy as PropertySortBy)) {
      throw new BadRequestError("sortBy must be createdAt or price.");
    }
    if (!sortOrders.includes(sortOrder as PropertySortOrder)) {
      throw new BadRequestError("sortOrder must be asc or desc.");
    }
    if (limit > 100) throw new BadRequestError("limit must not exceed 100.");

    const result = await getAllProperties({
      status: status as PropertyListStatus,
      search,
      type: type as PropertyType | undefined,
      page,
      limit,
      sortBy: sortBy as PropertySortBy,
      sortOrder: sortOrder as PropertySortOrder,
    });

    res.status(HttpStatusCode.OK).json({
      ...result,
      data: result.data.map((property) => ({
        id: property.id,
        title: property.title || property.name,
        type: property.propertyType,
        location: {
          area: property.area,
          city: property.city,
          country: property.country,
        },
        price: { amount: property.priceAmount, currency: property.priceCurrency },
        viewCount: property.viewCount,
        coverImageUrl: property.coverImageUrl,
        isPublished: property.isPublished,
        createdAt: property.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof BadRequestError) return next(error);
    logger.error(`Error getting properties: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAllPropertiesHandler;
