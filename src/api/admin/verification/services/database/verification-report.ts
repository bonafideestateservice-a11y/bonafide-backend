import {
  AgentAssignmentStatus,
  Prisma,
  ReportReviewStatus,
  VerificationStatus,
} from "@prisma/client";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import {
  isRecurringRequest,
  nextStatusAfterRecurringReport,
} from "../../../../services/database/verification-lifecycle";

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
      orderBy: { generatedAt: "desc" },
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

/**
 * Submit the report for an assignment's period. The report records the period's payment, the
 * agent's notes and the checklist, so it outlives the assignment.
 * - One-time requests: the assignment becomes REPORT_SUBMITTED and the request COMPLETED.
 * - Recurring requests: the assignment is deleted and the request waits for the next period
 *   (SUBMITTED if it's already paid, AWAITING_RENEWAL otherwise, COMPLETED if the
 *   subscription has ended).
 */
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
          transactionId: true,
          additionalNotes: true,
          checklistItems: { select: { label: true, status: true } },
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

      const { verificationRequestId } = assignment;
      const reportSelect = { id: true, reviewStatus: true, generatedAt: true } as const;
      const existingReport = assignment.transactionId
        ? await transaction.verificationReport.findUnique({
            where: { transactionId: assignment.transactionId },
            select: reportSelect,
          })
        : await transaction.verificationReport.findFirst({
            where: { verificationRequestId, transactionId: null },
            select: reportSelect,
          });

      const generatedAt = new Date();
      const report =
        existingReport ??
        (await transaction.verificationReport.create({
          data: {
            verificationRequest: { connect: { id: verificationRequestId } },
            agent: { connect: { id: agentId } },
            ...(assignment.transactionId
              ? { transaction: { connect: { id: assignment.transactionId } } }
              : {}),
            additionalNotes: assignment.additionalNotes,
            reviewStatus: ReportReviewStatus.PENDING,
            generatedAt,
          },
          select: reportSelect,
        }));

      if (!existingReport) {
        uploadedReport = { reportId: report.id, verificationRequestId };
      }

      await transaction.verificationChecklistItem.updateMany({
        where: { agentAssignmentId: assignment.id },
        data: { reportId: report.id },
      });

      if (await isRecurringRequest(transaction, verificationRequestId)) {
        await transaction.agentAssignment.delete({ where: { id: assignment.id } });
        await transaction.verificationRequest.update({
          where: { id: verificationRequestId },
          data: {
            status: await nextStatusAfterRecurringReport(transaction, verificationRequestId),
          },
        });
      } else {
        await transaction.agentAssignment.update({
          where: { id: assignment.id },
          data: {
            status: AgentAssignmentStatus.REPORT_SUBMITTED,
            completedAt: existingReport ? undefined : generatedAt,
          },
        });
        await transaction.verificationRequest.updateMany({
          where: { id: verificationRequestId, status: { not: VerificationStatus.CANCELLED } },
          data: { status: VerificationStatus.COMPLETED },
        });
      }

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

type ReportViewSource = {
  details: Prisma.JsonValue;
  user: { fullName: string; phone: string | null; email: string };
  checklistItems: { label: string; media: { url: string }[] }[];
  additionalNotes: string | null;
  reportUrl: string | null;
};

const toReportView = (source: ReportViewSource): AgentAssignmentReport => {
  const names = source.user.fullName.trim().split(/\s+/);
  const address =
    typeof source.details === "object" && source.details !== null && !Array.isArray(source.details)
      ? (source.details as Record<string, unknown>).propertyAddress
      : "";

  return {
    client: {
      firstName: names[0] || "",
      lastName: names.slice(1).join(" "),
      phone: source.user.phone ?? "",
      email: source.user.email,
    },
    address: typeof address === "string" ? address : String(address ?? ""),
    photos: source.checklistItems.flatMap((item) =>
      item.media.map((media) => ({ url: media.url, label: item.label })),
    ),
    additionalNotes: source.additionalNotes ?? "",
    reportUrl: source.reportUrl,
  };
};

const reportChecklistSelect = {
  select: { label: true, media: { select: { url: true } } },
  orderBy: { sortOrder: "asc" },
} satisfies Prisma.VerificationChecklistItemFindManyArgs;

export const getAgentAssignmentReport = async (
  agentId: string,
  assignmentId: string,
): Promise<AgentAssignmentReport | null> => {
  try {
    const assignment = await prismaClient.agentAssignment.findFirst({
      where: { id: assignmentId, agentId },
      select: {
        additionalNotes: true,
        transaction: { select: { report: { select: { reportUrl: true } } } },
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true, phone: true, email: true } },
            reports: {
              select: { reportUrl: true },
              orderBy: { generatedAt: "desc" },
              take: 1,
            },
          },
        },
        checklistItems: reportChecklistSelect,
      },
    });

    if (!assignment) return null;

    return toReportView({
      details: assignment.verificationRequest.details,
      user: assignment.verificationRequest.user,
      checklistItems: assignment.checklistItems,
      additionalNotes: assignment.additionalNotes,
      reportUrl:
        assignment.transaction?.report?.reportUrl ??
        assignment.verificationRequest.reports[0]?.reportUrl ??
        null,
    });
  } catch (error) {
    logger.error(`Error fetching assignment report assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

export type AgentReportDetail = AgentAssignmentReport & {
  id: string;
  verificationRequestId: string;
  generatedAt: Date | null;
  reviewStatus: ReportReviewStatus;
};

/**
 * One of the agent's own reports, by report ID. Unlike getAgentAssignmentReport this keeps
 * working after a recurring assignment is released, because the report holds its own notes
 * and checklist.
 */
export const getAgentReportById = async (
  agentId: string,
  reportId: string,
): Promise<AgentReportDetail | null> => {
  try {
    const report = await prismaClient.verificationReport.findFirst({
      where: { id: reportId, submittedByAgentId: agentId },
      select: {
        id: true,
        verificationRequestId: true,
        generatedAt: true,
        reviewStatus: true,
        reportUrl: true,
        additionalNotes: true,
        checklistItems: reportChecklistSelect,
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true, phone: true, email: true } },
          },
        },
      },
    });

    if (!report) return null;

    return {
      id: report.id,
      verificationRequestId: report.verificationRequestId,
      generatedAt: report.generatedAt,
      reviewStatus: report.reviewStatus,
      ...toReportView({
        details: report.verificationRequest.details,
        user: report.verificationRequest.user,
        checklistItems: report.checklistItems,
        additionalNotes: report.additionalNotes,
        reportUrl: report.reportUrl,
      }),
    };
  } catch (error) {
    logger.error(`Error fetching agent report reportId=${reportId} agentId=${agentId} ${error}`);
    throw error;
  }
};
