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

    let agentData = null;
    if (summary.agentAssignment?.agent) {
      const agentNameParts = summary.agentAssignment.agent.name.split(" ");
      const firstName = agentNameParts[0] || "";
      const lastName = agentNameParts.slice(1).join(" ") || "";
      
      agentData = {
        firstName,
        lastName,
      };
    }

    let mediaPreview: Array<{ url: string }> = [];
    if (summary.agentAssignment?.checklistItems) {
      for (const item of summary.agentAssignment.checklistItems) {
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
    if (summary.report?.findings && Array.isArray(summary.report.findings)) {
      insights = summary.report.findings as any;
    }

    const responsePayload = {
      property: propertyName,
      inspectionDate: summary.report?.generatedAt?.toISOString() || null,
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
