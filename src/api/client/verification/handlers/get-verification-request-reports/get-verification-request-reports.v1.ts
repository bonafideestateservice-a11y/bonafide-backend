import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestReportsForUser } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

const getNames = (fullName: string) => {
  const names = fullName.trim().split(/\s+/);
  return { firstName: names[0] || "", lastName: names.slice(1).join(" ") };
};

/** Report history for a verification request: one entry per reported period, newest first. */
export const getVerificationRequestReports = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const reports = await getVerificationRequestReportsForUser(req.params.id, userId);
    if (!reports) return next(new NotFoundError("Verification request not found."));

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Verification reports retrieved successfully",
      data: reports.map((report) => ({
        id: report.id,
        generatedAt: report.generatedAt?.toISOString() ?? null,
        reviewStatus: report.reviewStatus,
        viewed: report.viewedAt !== null,
        agent: getNames(report.agent.name),
        payment: report.transaction
          ? {
              paidAt: report.transaction.paidAt?.toISOString() ?? null,
              amountInCents: report.transaction.amountInCents,
              currency: report.transaction.currency,
            }
          : null,
      })),
    });
  } catch (error) {
    logger.error(`Error getting verification request reports: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getVerificationRequestReports;
