import { PropertyRequestStatus, PropertyRequestType } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";
import { listPropertyRequests } from "../../../../services/database/property-request";
import { userIdOf } from "../shared";

/** The client's purchase and consultation requests, newest first. */
export const getPropertyRequestsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const paging = parsePaging(req.query);
  const { type, status } = req.query;
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
    const where = {
      userId: userIdOf(req),
      ...(type ? { type: type as PropertyRequestType } : {}),
      ...(status ? { status: status as PropertyRequestStatus } : {}),
    };
    res
      .status(HttpStatusCode.OK)
      .json(await listPropertyRequests(where, paging.page, paging.limit));
  } catch (error) {
    logger.error(`Error listing property requests: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
