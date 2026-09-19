import { Prisma, ReportReviewStatus } from "@prisma/client";
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
