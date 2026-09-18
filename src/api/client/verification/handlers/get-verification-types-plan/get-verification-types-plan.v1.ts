import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import {
  getVerificationPlansForTypeSlug,
  VerificationPlanCard,
} from "../../services/database/verification-plan";
import { logger } from "../../../../../utils/logger";

export const getVerificationTypesPlan = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const plans = await getVerificationPlansForTypeSlug(req.params.slug);
    const response: Array<
      Omit<VerificationPlanCard, "description"> & { description: string }
    > = plans.map((plan) => ({
      ...plan,
      description: plan.description ?? "",
    }));

    res.status(HttpStatusCode.OK).json(response);
  } catch (error) {
    logger.error(`Error getting verification type plans: ${error}`);
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};

export default getVerificationTypesPlan;
