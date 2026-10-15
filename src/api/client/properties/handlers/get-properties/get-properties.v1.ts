import { PropertyType } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";
import { toPropertyResponse } from "../../../../admin/dashboard/handlers/get-all-properties/get-all-properties.v1";
import { getAllProperties } from "../../../../admin/dashboard/services/database/property";

const types = Object.values(PropertyType);

/** Optional string query value, trimmed; undefined when missing or blank. */
const textQuery = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Optional whole-naira price; commas allowed. */
const priceQuery = (value: unknown, name: string) => {
  const raw = textQuery(value);
  if (raw === undefined) return undefined;
  const price = Number(raw.replace(/,/g, ""));
  if (!Number.isInteger(price) || price < 0) {
    throw new BadRequestError(`${name} must be a whole number of 0 or more.`);
  }
  return price;
};

/** Explore Properties: published properties with search and filters. Public. */
export const getPropertiesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const paging = parsePaging(req.query, 12);
    if (!paging) {
      throw new BadRequestError("page and limit must be positive integers (limit ≤ 100).");
    }
    const type = textQuery(req.query.type);
    if (type !== undefined && !types.includes(type as PropertyType)) {
      throw new BadRequestError("type must be HOUSE, APARTMENT, LAND or COMMERCIAL.");
    }
    const minPrice = priceQuery(req.query.minPrice, "minPrice");
    const maxPrice = priceQuery(req.query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new BadRequestError("minPrice must not be more than maxPrice.");
    }

    const result = await getAllProperties({
      status: "published",
      search: textQuery(req.query.search) ?? "",
      type: type as PropertyType | undefined,
      minPrice,
      maxPrice,
      area: textQuery(req.query.area),
      city: textQuery(req.query.city),
      ...paging,
    });
    res.status(HttpStatusCode.OK).json({
      data: result.data.map(toPropertyResponse),
      meta: result.meta,
    });
  } catch (error) {
    if (error instanceof BadRequestError) return next(error);
    logger.error(`Error exploring properties: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
