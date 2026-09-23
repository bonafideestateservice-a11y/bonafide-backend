import { AgentAssignmentStatus, Prisma, ReportReviewStatus } from "@prisma/client";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export interface AgentReportsFilter {
  reviewStatus?: "ALL" | "APPROVED" | "REVISION_REQUESTED";
  search?: string;
}

export type AgentReportSummary = Prisma.VerificationReportGetPayload<{
  select: {
    id: true;
    generatedAt: true;
    reviewStatus: true;
    rating: true;
    reportUrl: true;
    verificationRequest: {
      select: {
        details: true;
        user: { select: { fullName: true } };
        verificationType: { select: { name: true } };
      };
    };
  };
}>;

export const getAgentReports = async (
  agentId: string,
  { reviewStatus = "ALL", search = "" }: AgentReportsFilter = {},
): Promise<AgentReportSummary[]> => {
  try {
    const normalizedSearch = search.trim();
    const statusFilter = reviewStatus === "ALL" ? undefined : (reviewStatus as ReportReviewStatus);

    return await prismaClient.verificationReport.findMany({
      where: {
        submittedByAgentId: agentId,
        ...(statusFilter ? { reviewStatus: statusFilter } : {}),
        ...(normalizedSearch
          ? {
              OR: [
                {
                  verificationRequest: {
                    user: {
                      fullName: {
                        contains: normalizedSearch,
                        mode: "insensitive",
                      },
                    },
                  },
                },
                {
                  verificationRequest: {
                    verificationType: {
                      name: {
                        contains: normalizedSearch,
                        mode: "insensitive",
                      },
                    },
                  },
                },
                {
                  verificationRequest: {
                    details: {
                      path: ["propertyAddress"],
                      string_contains: normalizedSearch,
                    },
                  },
                },
                {
                  verificationRequest: {
                    details: {
                      path: ["constructionAddress"],
                      string_contains: normalizedSearch,
                    },
                  },
                },
                {
                  verificationRequest: {
                    details: {
                      path: ["businessAddress"],
                      string_contains: normalizedSearch,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { generatedAt: "desc" },
      select: {
        id: true,
        generatedAt: true,
        reviewStatus: true,
        rating: true,
        reportUrl: true,
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true } },
            verificationType: { select: { name: true } },
          },
        },
      },
    });
  } catch (error) {
    logger.error(`Error fetching agent reports agentId=${agentId} ${error}`);
    throw error;
  }
};

export const getAgentVerificationRequestReport = async (
  agentId: string,
  verificationRequestId: string,
) => {
  try {
    return await prismaClient.verificationReport.findFirst({
      where: {
        submittedByAgentId: agentId,
        verificationRequestId,
      },
      include: {
        media: true,
        verificationRequest: {
          include: {
            verificationType: true,
            user: true,
          },
        },
        agent: true,
      },
    });
  } catch (error) {
    logger.error(
      `Error fetching agent report requestId=${verificationRequestId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

export type SubmitAgentReportResult =
  | {
      kind: "INCOMPLETE_CHECKLIST";
      progressPercent: number;
      remainingItems: string[];
    }
  | {
      kind: "SUBMITTED";
      id: string;
      reviewStatus: ReportReviewStatus;
      generatedAt: Date;
    };

export const submitAgentAssignmentReport = async (
  agentId: string,
  assignmentId: string,
): Promise<SubmitAgentReportResult | null> => {
  try {
    let uploadedReport: { reportId: string; verificationRequestId: string } | undefined;
    const result = await prismaClient.$transaction(async (transaction) => {
      const assignment = await transaction.agentAssignment.findFirst({
        where: { id: assignmentId, agentId },
        select: {
          id: true,
          verificationRequestId: true,
          checklistItems: { select: { label: true, status: true } },
          verificationRequest: {
            select: {
              report: { select: { id: true, reviewStatus: true, generatedAt: true } },
            },
          },
        },
      });

      if (!assignment) return null;

      const totalItems = assignment.checklistItems.length;
      const completedItems = assignment.checklistItems.filter(
        (item) => item.status === "COMPLETE",
      ).length;
      const progressPercent = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;
      const remainingItems = assignment.checklistItems
        .filter((item) => item.status !== "COMPLETE")
        .map((item) => item.label);

      if (remainingItems.length > 0) {
        return { kind: "INCOMPLETE_CHECKLIST" as const, progressPercent, remainingItems };
      }

      const generatedAt = new Date();
      const report = assignment.verificationRequest.report
        ? assignment.verificationRequest.report
        : await transaction.verificationReport.create({
            data: {
              verificationRequest: { connect: { id: assignment.verificationRequestId } },
              agent: { connect: { id: agentId } },
              reviewStatus: ReportReviewStatus.PENDING,
              generatedAt,
            },
            select: { id: true, reviewStatus: true, generatedAt: true },
          });

      if (!assignment.verificationRequest.report) {
        uploadedReport = {
          reportId: report.id,
          verificationRequestId: assignment.verificationRequestId,
        };
      }

      await transaction.agentAssignment.update({
        where: { id: assignment.id },
        data: {
          status: AgentAssignmentStatus.INSPECTION_COMPLETE,
          completedAt: assignment.verificationRequest.report ? undefined : generatedAt,
        },
      });

      return {
        kind: "SUBMITTED" as const,
        id: report.id,
        reviewStatus: report.reviewStatus,
        generatedAt: report.generatedAt ?? generatedAt,
      };
    });

    if (uploadedReport) {
      appEvents.emit(AppEventTypes.REPORT_UPLOADED, {
        ...uploadedReport,
        submittedByAgentId: agentId,
      });
    }

    return result;
  } catch (error) {
    logger.error(`Error submitting assignment report assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

export type AgentAssignmentReport = {
  client: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  address: string;
  photos: { url: string; label: string }[];
  additionalNotes: string;
  reportUrl: string | null;
};

export const getAgentAssignmentReport = async (
  agentId: string,
  assignmentId: string,
): Promise<AgentAssignmentReport | null> => {
  try {
    const assignment = await prismaClient.agentAssignment.findFirst({
      where: { id: assignmentId, agentId },
      select: {
        additionalNotes: true,
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true, phone: true, email: true } },
            report: { select: { reportUrl: true } },
          },
        },
        checklistItems: {
          select: {
            label: true,
            media: { select: { url: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!assignment) return null;
    const names = assignment.verificationRequest.user.fullName.trim().split(/\s+/);
    const details = assignment.verificationRequest.details;
    const address =
      typeof details === "object" && details !== null && !Array.isArray(details)
        ? (details as Record<string, unknown>).propertyAddress
        : "";

    return {
      client: {
        firstName: names[0] || "",
        lastName: names.slice(1).join(" "),
        phone: assignment.verificationRequest.user.phone ?? "",
        email: assignment.verificationRequest.user.email,
      },
      address: typeof address === "string" ? address : String(address ?? ""),
      photos: assignment.checklistItems.flatMap((item) =>
        item.media.map((media) => ({ url: media.url, label: item.label })),
      ),
      additionalNotes: assignment.additionalNotes ?? "",
      reportUrl: assignment.verificationRequest.report?.reportUrl ?? null,
    };
  } catch (error) {
    logger.error(`Error fetching assignment report assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};
