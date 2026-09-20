import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestFullReportForUser } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

export const getVerificationRequestFullReport = async (
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

    const fullReport = await getVerificationRequestFullReportForUser(
      verificationRequestId,
      userId,
    );

    if (!fullReport || !fullReport.report) {
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
    
    if (fullReport.details && typeof fullReport.details === "object" && !Array.isArray(fullReport.details)) {
      const details = fullReport.details as any;
      propertyDetails = {
        name: details.propertyName || propertyDetails.name,
        address: details.propertyAddress || propertyDetails.address,
        type: details.propertyType || propertyDetails.type,
        plotSize: details.plotSize || propertyDetails.plotSize,
        builtYear: details.builtYear || propertyDetails.builtYear,
      };
    }

    let agentData = null;
    let agentNotes = "";
    if (fullReport.agentAssignment?.agent) {
      const agentNameParts = fullReport.agentAssignment.agent.name.split(" ");
      const firstName = agentNameParts[0] || "";
      const lastName = agentNameParts.slice(1).join(" ") || "";
      
      agentData = {
        firstName,
        lastName,
      };
      agentNotes = fullReport.agentAssignment.additionalNotes || "";
    }

    let photos: Array<{ url: string; label: string }> = [];
    if (fullReport.agentAssignment?.checklistItems) {
      for (const item of fullReport.agentAssignment.checklistItems) {
        if (item.media) {
          item.media.forEach((m: any) => {
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
    const rawFindings: any[] = [];
    if (fullReport.report.findings && Array.isArray(fullReport.report.findings)) {
      const findingsArray = fullReport.report.findings as any[];
      findingsArray.forEach((f) => rawFindings.push(f));

      const ownershipItem = findingsArray.find((f) => f.label?.toLowerCase().includes("ownership"));
      if (ownershipItem && ownershipItem.value) {
        ownershipFindings = ownershipItem.value;
      } else {
        ownershipFindings = JSON.stringify(fullReport.report.findings);
      }
      
      // Fallback for plotSize, builtYear, type from findings if they are missing in details
      if (propertyDetails.type === "Not provided") {
        const typeItem = findingsArray.find((f) => f.label?.toLowerCase().includes("type"));
        if (typeItem) propertyDetails.type = typeItem.value;
      }
      if (propertyDetails.plotSize === "Not provided") {
        const plotItem = findingsArray.find((f) => f.label?.toLowerCase().includes("plot") || f.label?.toLowerCase().includes("size"));
        if (plotItem) propertyDetails.plotSize = plotItem.value;
      }
      if (propertyDetails.builtYear === "Not provided") {
        const yearItem = findingsArray.find((f) => f.label?.toLowerCase().includes("year"));
        if (yearItem) propertyDetails.builtYear = yearItem.value;
      }
    }

    const responsePayload = {
      id: fullReport.id,
      reportId: fullReport.report.id,
      generatedAt: fullReport.report.generatedAt?.toISOString() || null,
      reviewStatus: fullReport.report.reviewStatus,
      property: propertyDetails,
      summary: fullReport.report.summary || "",
      ownershipFindings,
      findings: rawFindings, // Returning raw findings directly for frontend flexibility
      photos,
      agentNotes,
      agent: agentData,
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
