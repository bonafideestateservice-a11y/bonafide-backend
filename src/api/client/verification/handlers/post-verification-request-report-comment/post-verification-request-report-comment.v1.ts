import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { logger } from "../../../../../utils/logger";
import { findLatestReport, saveReportFeedback } from "../../services/database/verification-request";

const MAX_COMMENT_LENGTH = 1000;

/** "Leave a Comment" on the latest report. Sending it again overwrites the feedback. */
export const postVerificationRequestReportComment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { rating, comment } = req.body ?? {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return next(new BadRequestError("rating must be a whole number from 1 to 5."));
  }
  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return next(new BadRequestError("comment must be a string."));
  }
  const text = typeof comment === "string" ? comment.trim() : "";
  if (text.length > MAX_COMMENT_LENGTH) {
    return next(new BadRequestError(`comment must be at most ${MAX_COMMENT_LENGTH} characters.`));
  }

  try {
    const request = await findLatestReport(req.params.id);
    if (!request) return next(new NotFoundError("Verification request not found."));
    if (request.userId !== (req as CustomRequest).user?.id) {
      return next(new ForbiddenError("You cannot comment on this report."));
    }
    const [report] = request.reports;
    if (!report) return next(new NotFoundError("Verification report not found."));

    const saved = await saveReportFeedback(report.id, rating, text || null);
    res.status(HttpStatusCode.OK).json({
      reportId: saved.id,
      rating: saved.rating,
      comment: saved.clientComment,
      ratedAt: saved.ratedAt?.toISOString() ?? null,
    });
  } catch (error) {
    logger.error(`Error saving report comment: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
