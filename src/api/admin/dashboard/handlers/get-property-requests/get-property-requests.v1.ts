import { Prisma, PropertyRequestStatus, PropertyRequestType } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";
import {
  listPropertyRequests,
  toAdminRequestResponse,
} from "../../../../services/database/property-request";

/** Every client's purchase and consultation requests, newest first. */
export const getAdminPropertyRequestsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const paging = parsePaging(req.query);
  const { type, status } = req.query;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (!paging) {
    return next(new BadRequestError("page and limit must be positive integers (limit ≤ 100)."));
  }
  if (
    type !== undefined &&
    !Object.values(PropertyRequestType).includes(type as PropertyRequestType)
  ) {
    return next(new BadRequestError("type must be PURCHASE or CONSULTATION."));
  }
  if (
    status !== undefined &&
    !Object.values(PropertyRequestStatus).includes(status as PropertyRequestStatus)
  ) {
    return next(
      new BadRequestError(
        `status must be one of ${Object.values(PropertyRequestStatus).join(", ")}.`,
      ),
    );
  }
  try {
    const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
    const where: Prisma.PropertyRequestWhereInput = {
      ...(type ? { type: type as PropertyRequestType } : {}),
      ...(status ? { status: status as PropertyRequestStatus } : {}),
      ...(search
        ? {
            OR: [
              { reference: contains(search) },
              { user: { fullName: contains(search) } },
              { user: { email: contains(search) } },
              { property: { name: contains(search) } },
            ],
          }
        : {}),
    };
    res
      .status(HttpStatusCode.OK)
      .json(await listPropertyRequests(where, paging.page, paging.limit, toAdminRequestResponse));
  } catch (error) {
    logger.error(`Error listing property requests for admin: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
