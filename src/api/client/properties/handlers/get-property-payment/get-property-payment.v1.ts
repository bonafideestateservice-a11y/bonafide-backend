import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  findPropertyRequest,
  toPaymentResponse,
} from "../../../../services/database/property-request";
import { userIdOf } from "../shared";

/** "View payment / deposit", and polling while a payment is processing. */
export const getPropertyPaymentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await findPropertyRequest({ id: req.params.id, userId: userIdOf(req) });
    if (!request) return next(new NotFoundError("Purchase request not found."));
    if (!request.payment) {
      return next(new NotFoundError("No payment is ready for this purchase yet."));
    }
    res.status(HttpStatusCode.OK).json(toPaymentResponse(request.payment));
  } catch (error) {
    logger.error(`Error getting property payment: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
