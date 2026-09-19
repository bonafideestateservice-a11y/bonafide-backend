import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode, NotFoundError } from "../../../../exceptions";
import { CustomRequest } from "../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../authentication/services/database/agent";
import { getAgentReports } from "../services/database/verification-report";
import { logger } from "../../../../utils/logger";

const getNames = (fullName: string) => {
  const names = fullName.trim().split(/\s+/);
  return { firstName: names[0] || "", lastName: names.slice(1).join(" ") };
};

const getDistrict = (details: unknown): string => {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return "";
  const record = details as Record<string, unknown>;
  const address = record.propertyAddress ?? record.constructionAddress ?? record.businessAddress;
  return typeof address === "string" ? address : String(address ?? "");
};

export const getAgentsReports = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));

    const reviewStatus = req.query.reviewStatus === undefined ? "ALL" : req.query.reviewStatus;
    if (!["ALL", "APPROVED", "REVISION_REQUESTED"].includes(String(reviewStatus))) {
      return next(
        new BadRequestError("Review status must be ALL, APPROVED, or REVISION_REQUESTED."),
      );
    }
    if (req.query.search !== undefined && typeof req.query.search !== "string") {
      return next(new BadRequestError("Search must be a string."));
    }

    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));
    const reports = await getAgentReports(agent.id, {
      reviewStatus: reviewStatus as "ALL" | "APPROVED" | "REVISION_REQUESTED",
      search: typeof req.query.search === "string" ? req.query.search : "",
    });

    res.status(HttpStatusCode.OK).json(
      reports.map((report) => ({
        id: report.id,
        verificationType: report.verificationRequest.verificationType,
        client: getNames(report.verificationRequest.user.fullName),
        district: getDistrict(report.verificationRequest.details),
        generatedAt: report.generatedAt?.toISOString() ?? "",
        reviewStatus: report.reviewStatus,
        rating: report.rating,
        reportUrl: report.reportUrl ?? "",
      })),
    );
  } catch (error) {
    logger.error(`Error getting agent reports: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAgentsReports;
