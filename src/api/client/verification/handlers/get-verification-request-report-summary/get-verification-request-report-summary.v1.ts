import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestReportSummaryForUser } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";
import {
  toClientReportChecklist,
  toClientReportDocument,
  toClientVerificationReportView,
} from "../../../../services/client-verification-report";

export const getVerificationRequestReportSummary = async (
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

    const verificationRequestId = req.params.id;
    if (!verificationRequestId?.trim()) {
      return next(new NotFoundError("Verification request not found."));
    }

    const summary = await getVerificationRequestReportSummaryForUser(verificationRequestId, userId);

    if (!summary) {
      return next(new NotFoundError("Verification request not found."));
    }

    // Default values if data is missing
    let propertyAddress = "Address not provided";
    let propertyName = "Property";

    if (summary.details && typeof summary.details === "object" && !Array.isArray(summary.details)) {
      const details = summary.details as Record<string, unknown>;
      if (typeof details.propertyAddress === "string" && details.propertyAddress) {
        propertyAddress = details.propertyAddress;
      }
      if (typeof details.propertyName === "string" && details.propertyName) {
        propertyName = details.propertyName;
      }
    }

    // Recurring requests have one report per paid period; summarise the latest.
    const report = summary.reports[0];
    const clientReport = report
      ? toClientVerificationReportView(report)
      : { verificationTier: null, subscriptionPeriod: null, findings: null };
    const mediaPreview: Array<{ url: string }> = [];
    const checklistItems = report?.checklistItems.length
      ? report.checklistItems
      : summary.agentAssignment?.checklistItems;
    const checklist = toClientReportChecklist(checklistItems ?? []);
    if (checklistItems) {
      for (const item of checklistItems) {
        if (item.media) {
          item.media.forEach((m) => {
            if (mediaPreview.length < 3) {
              mediaPreview.push({ url: m.url });
            }
          });
        }
      }
    }

    const insights = report?.findings && Array.isArray(report.findings) ? report.findings : [];

    const responsePayload = {
      property: propertyName,
      inspectionDate: report?.generatedAt?.toISOString() || null,
      location: propertyAddress,
      reportType:
        clientReport.verificationTier?.name ?? summary.verificationPlan?.name ?? "Standard Report",
      insights,
      findings: clientReport.findings ?? [],
      verificationTier: clientReport.verificationTier,
      subscriptionPeriod: clientReport.subscriptionPeriod,
      providerName: "Bonafide",
      checklist,
      reportDocument: toClientReportDocument(report?.media[0]),
      mediaPreview,
    };

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Report summary retrieved successfully",
      data: responsePayload,
    });
  } catch (error) {
    logger.error(`Error in getVerificationRequestReportSummary handler: ${error}`);
    next(error);
  }
};
