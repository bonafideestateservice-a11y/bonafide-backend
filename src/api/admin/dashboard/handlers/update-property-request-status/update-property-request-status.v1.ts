import { PropertyRequestStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  setPropertyRequestStatus,
  toAdminRequestResponse,
} from "../../../../services/database/property-request";

const MAX_NOTE_LENGTH = 1000;

/**
 * Moves a request through its steps. A purchase reaching IN_PROGRESS gets its payment, for
 * the property's listed price.
 */
export const updatePropertyRequestStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { status, note } = req.body ?? {};
  if (!Object.values(PropertyRequestStatus).includes(status)) {
    return next(
      new BadRequestError(
        `status must be one of ${Object.values(PropertyRequestStatus).join(", ")}.`,
      ),
    );
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return next(new BadRequestError("note must be a string."));
  }
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > MAX_NOTE_LENGTH) {
    return next(new BadRequestError(`note must be at most ${MAX_NOTE_LENGTH} characters.`));
  }
  try {
    const result = await setPropertyRequestStatus(req.params.id, status, text || null);
    switch (result.kind) {
      case "NOT_FOUND":
        return next(new NotFoundError("Property request not found."));
      case "FINISHED":
        return next(
          new ConflictError(
            `This request is already ${result.status.toLowerCase()} and can't change.`,
          ),
        );
      case "NOT_A_PURCHASE":
        return next(new BadRequestError("Only purchase requests can be IN_PROGRESS or OWNERSHIP_TRANSFER."));
      default:
        res.status(HttpStatusCode.OK).json(toAdminRequestResponse(result.request));
    }
  } catch (error) {
    logger.error(`Error updating property request status: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
