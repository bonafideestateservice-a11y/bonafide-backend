import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import {
  getVerificationTypesForService,
  VerificationTypeCard,
} from "../../services/database/verification-type";
import { logger } from "../../../../../utils/logger";

export const getVerificationTypes = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const verificationTypes =
      await getVerificationTypesForService("verification");

    const response: Array<
      Omit<VerificationTypeCard, "description"> & { description: string }
    > = verificationTypes.map((verificationType) => ({
      ...verificationType,
      description: verificationType.description ?? "",
    }));

    res.status(HttpStatusCode.OK).json(response);
  } catch (error) {
    logger.error(`Error getting verification types: ${error}`);
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};
