import { NextFunction, Request, Response } from "express";
import { ForbiddenError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestFullReportData } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

/** One finding the agent recorded, e.g. { label: "Ownership", value: "Verified" }. */
type Finding = { label?: string; value?: string; status?: string };

export const getVerificationRequestFullReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const verificationRequestId = req.params.id;
    if (!verificationRequestId?.trim()) {
      return next(new NotFoundError("Verification request not found."));
    }

    const fullReport = await getVerificationRequestFullReportData(verificationRequestId);

    if (fullReport && fullReport.userId !== (req as CustomRequest).user?.id) {
      return next(new ForbiddenError("You cannot view this report."));
    }

    // Recurring requests have one report per paid period; show the latest.
    const report = fullReport?.reports[0];
    if (!fullReport || !report) {
      return next(new NotFoundError("Verification report not found."));
    }

    // Default values if data is missing
    let propertyDetails = {
      name: "Property",
      address: "Address not provided",
      type: "Not provided",
      plotSize: "Not provided",
      builtYear: "Not provided",
    };

    if (
      fullReport.details &&
      typeof fullReport.details === "object" &&
      !Array.isArray(fullReport.details)
    ) {
      const details = fullReport.details as Record<string, string | undefined>;
      propertyDetails = {
        name: details.propertyName || propertyDetails.name,
        address: details.propertyAddress || propertyDetails.address,
        type: details.propertyType || propertyDetails.type,
        plotSize: details.plotSize || propertyDetails.plotSize,
        builtYear: details.builtYear || propertyDetails.builtYear,
      };
    }

    // The report keeps its own agent, notes and checklist (recurring assignments are removed
    // after each period); older reports fall back to the assignment.
    const reportAgent = report.agent ?? fullReport.agentAssignment?.agent;
    let agentData = null;
    let agentNotes = "";
    if (reportAgent) {
      const agentNameParts = reportAgent.name.split(" ");
      const firstName = agentNameParts[0] || "";
      const lastName = agentNameParts.slice(1).join(" ") || "";

      agentData = {
        firstName,
        lastName,
      };
      agentNotes = report.additionalNotes ?? fullReport.agentAssignment?.additionalNotes ?? "";
    }

    const photos: Array<{ url: string; label: string }> = [];
    const checklistItems = report.checklistItems.length
      ? report.checklistItems
      : fullReport.agentAssignment?.checklistItems;
    if (checklistItems) {
      for (const item of checklistItems) {
        if (item.media) {
          item.media.forEach((m) => {
            photos.push({ url: m.url, label: item.label });
          });
        }
      }
    }

    // Since findings might be a JSON array, we can structure it if needed
    // The requirement says: Property Overview (Type, Plot Size, Built Year) from findings.* and Ownership Verification section from findings.*
    // In our payload we'll return it as ownershipFindings or pass the findings array back
    // The prompt asks for: ownershipFindings: string. We will parse it from findings if possible, or return a default string.
    let ownershipFindings = "Verification completed.";
    const rawFindings: Finding[] = [];
    if (report.findings && Array.isArray(report.findings)) {
      const findingsArray = report.findings as Finding[];
      findingsArray.forEach((f) => rawFindings.push(f));

      const ownershipItem = findingsArray.find((f) => f.label?.toLowerCase().includes("ownership"));
      if (ownershipItem && ownershipItem.value) {
        ownershipFindings = ownershipItem.value;
      } else {
        ownershipFindings = JSON.stringify(report.findings);
      }

      // Fallback for plotSize, builtYear, type from findings if they are missing in details
      if (propertyDetails.type === "Not provided") {
        const typeItem = findingsArray.find((f) => f.label?.toLowerCase().includes("type"));
        if (typeItem) propertyDetails.type = typeItem.value as string;
      }
      if (propertyDetails.plotSize === "Not provided") {
        const plotItem = findingsArray.find(
          (f) => f.label?.toLowerCase().includes("plot") || f.label?.toLowerCase().includes("size"),
        );
        if (plotItem) propertyDetails.plotSize = plotItem.value as string;
      }
      if (propertyDetails.builtYear === "Not provided") {
        const yearItem = findingsArray.find((f) => f.label?.toLowerCase().includes("year"));
        if (yearItem) propertyDetails.builtYear = yearItem.value as string;
      }
    }

    const responsePayload = {
      id: fullReport.id,
      reportId: report.id,
      generatedAt: report.generatedAt?.toISOString() || null,
      reviewStatus: report.reviewStatus,
      client: {
        name: fullReport.user.fullName,
        phone: fullReport.user.phone,
        email: fullReport.user.email,
      },
      property: propertyDetails,
      summary: report.summary || "",
      ownershipFindings,
      findings: rawFindings, // Returning raw findings directly for frontend flexibility
      photos,
      agentNotes,
      agent: agentData,
      // The client's "Leave a Comment" feedback; null until they leave some.
      feedback: report.ratedAt
        ? {
            rating: report.rating,
            comment: report.clientComment,
            ratedAt: report.ratedAt.toISOString(),
          }
        : null,
    };

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Full report retrieved successfully",
      data: responsePayload,
    });
  } catch (error) {
    logger.error(`Error in getVerificationRequestFullReport handler: ${error}`);
    next(error);
  }
};
