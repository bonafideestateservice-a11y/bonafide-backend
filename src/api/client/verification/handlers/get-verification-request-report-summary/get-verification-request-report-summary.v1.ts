import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestReportSummaryForUser } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

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

    const summary = await getVerificationRequestReportSummaryForUser(
      verificationRequestId,
      userId,
    );

    if (!summary) {
      return next(new NotFoundError("Verification request not found."));
    }

    // Default values if data is missing
    let propertyAddress = "Address not provided";
    let propertyName = "Property";
    
    if (summary.details && typeof summary.details === "object" && !Array.isArray(summary.details)) {
      propertyAddress = (summary.details as any).propertyAddress || propertyAddress;
      propertyName = (summary.details as any).propertyName || propertyName;
    }

    // Recurring requests have one report per paid period; summarise the latest. The report
    // keeps its own agent and checklist; older reports fall back to the assignment.
    const report = summary.reports[0];
    const reportAgent = report?.agent ?? summary.agentAssignment?.agent;
    let agentData = null;
    if (reportAgent) {
      const agentNameParts = reportAgent.name.split(" ");
      const firstName = agentNameParts[0] || "";
      const lastName = agentNameParts.slice(1).join(" ") || "";
      
      agentData = {
        firstName,
        lastName,
      };
    }

    let mediaPreview: Array<{ url: string }> = [];
    const checklistItems = report?.checklistItems.length
      ? report.checklistItems
      : summary.agentAssignment?.checklistItems;
    if (checklistItems) {
      for (const item of checklistItems) {
        if (item.media) {
          item.media.forEach((m: any) => {
            if (mediaPreview.length < 3) {
              mediaPreview.push({ url: m.url });
            }
          });
        }
      }
    }

    let insights: Array<{ label: string; value: string; status: "good" | "warning" | "bad" }> = [];
    if (report?.findings && Array.isArray(report.findings)) {
      insights = report.findings as any;
    }

    const responsePayload = {
      property: propertyName,
      inspectionDate: report?.generatedAt?.toISOString() || null,
      agent: agentData,
      location: propertyAddress,
      reportType: summary.verificationPlan?.name || "Standard Report",
      insights,
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
