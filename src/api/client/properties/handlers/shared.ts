import { PropertyRequestType } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, ConflictError, HttpStatusCode, NotFoundError } from "../../../../exceptions";
import { CustomRequest } from "../../../../middlewares/check-jwt";
import { logger } from "../../../../utils/logger";
import {
  createPropertyRequest,
  PayablePayment,
  toRequestResponse,
} from "../../../services/database/property-request";

export const userIdOf = (req: Request) => (req as CustomRequest).user?.id as string;

/** POST handler for "Purchase Property" or "Request Consultation". */
export const createRequestHandler =
  (type: PropertyRequestType) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await createPropertyRequest(userIdOf(req), req.params.id, type);
      if (!result) return next(new NotFoundError("Property not found."));
      // 200 with the open request when one already exists, so a repeat never duplicates it.
      res
        .status(result.created ? HttpStatusCode.CREATED : HttpStatusCode.OK)
        .json(toRequestResponse(result.request));
    } catch (error) {
      logger.error(`Error creating ${type.toLowerCase()} request: ${error}`);
      next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
    }
  };

/** The error for a purchase payment that can't be paid now, or null when it can. */
export const paymentError = (result: PayablePayment) => {
  switch (result.kind) {
    case "NOT_FOUND":
      return new NotFoundError("Purchase request not found.");
    case "NO_PAYMENT":
      return new ConflictError(
        "No payment is ready yet. Bonafide opens the payment once your purchase is in progress.",
      );
    case "CLOSED":
      return new ConflictError(`This purchase is ${result.status.toLowerCase()}.`);
    case "PAID":
      return new ConflictError("This purchase has already been paid for.");
    default:
      return null;
  }
};
