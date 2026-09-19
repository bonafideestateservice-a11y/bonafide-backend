import { AgentAssignmentStatus, Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export type AgentAssignmentInformation = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    progressPercent: true;
    additionalNotes: true;
    scheduledAt: true;
    completedAt: true;
    agent: { select: { id: true; name: true; region: true } };
    verificationRequest: {
      select: {
        id: true;
        status: true;
        details: true;
        user: { select: { id: true; fullName: true; email: true } };
        verificationType: { select: { name: true; slug: true } };
      };
    };
    checklistItems: {
      select: { id: true; label: true; status: true; sortOrder: true };
      orderBy: { sortOrder: "asc" };
    };
  };
}>;

export interface AgentAssignmentStats {
  totalAgents: number;
  activeAgents: number;
  totalAssignments: number;
  averageProgressPercent: number;
  assignmentsByStatus: Record<AgentAssignmentStatus, number>;
}

export interface AgentSelfStats {
  activeCount: number;
  completedCount: number;
  avgRating: number;
}

export type AgentSelfAssignment = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    progressPercent: true;
    scheduledAt: true;
    verificationRequest: {
      select: {
        details: true;
        user: { select: { fullName: true } };
        verificationType: { select: { name: true } };
      };
    };
  };
}>;

export interface AgentAssignmentsFilter {
  limit?: number;
  status?: "ALL" | "IN_PROGRESS";
  search?: string;
}

export type AgentAssignmentDetail = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    scheduledAt: true;
    agentId: true;
    verificationRequest: {
      select: {
        details: true;
        user: { select: { fullName: true; phone: true; email: true } };
        verificationType: { select: { name: true } };
        transaction: {
          select: { status: true; amountInCents: true; currency: true };
        };
      };
    };
  };
}>;

export const getAgentAssignmentById = async (
  agentId: string,
  assignmentId: string,
): Promise<AgentAssignmentDetail | null> => {
  try {
    return await prismaClient.agentAssignment.findFirst({
      where: { id: assignmentId, agentId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        agentId: true,
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true, phone: true, email: true } },
            verificationType: { select: { name: true } },
            transaction: {
              select: { status: true, amountInCents: true, currency: true },
            },
          },
        },
      },
    });
  } catch (error) {
    logger.error(
      `Error fetching assignment detail assignmentId=${assignmentId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

export type StartedAgentAssignment = {
  id: string;
  status: AgentAssignmentStatus;
  checklist: {
    id: string;
    label: string;
    status: "PENDING";
    requiresMedia: boolean;
  }[];
};

export const startAgentAssignment = async (
  agentId: string,
  assignmentId: string,
): Promise<StartedAgentAssignment | null> => {
  try {
    return await prismaClient.$transaction(async (transaction) => {
      const assignment = await transaction.agentAssignment.findFirst({
        where: { id: assignmentId, agentId },
        select: {
          id: true,
          status: true,
          verificationRequest: {
            select: {
              verificationType: {
                select: {
                  checklistTemplateItems: {
                    select: { label: true, requiresMedia: true, sortOrder: true },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
          checklistItems: {
            select: { id: true, label: true, status: true, sortOrder: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!assignment) return null;

      if (assignment.checklistItems.length === 0) {
        await transaction.verificationChecklistItem.createMany({
          data: assignment.verificationRequest.verificationType.checklistTemplateItems.map(
            (item) => ({
              agentAssignmentId: assignment.id,
              label: item.label,
              sortOrder: item.sortOrder,
            }),
          ),
        });
      }

      const status =
        assignment.status === AgentAssignmentStatus.ASSIGNED
          ? AgentAssignmentStatus.ACCEPTED
          : assignment.status;

      await transaction.agentAssignment.update({
        where: { id: assignment.id },
        data: {
          status,
          progressPercent: assignment.checklistItems.length === 0 ? 0 : undefined,
        },
      });

      const checklistItems = await transaction.verificationChecklistItem.findMany({
        where: { agentAssignmentId: assignment.id },
        select: { id: true, label: true, status: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });

      return {
        id: assignment.id,
        status,
        checklist: checklistItems.map((item) => ({
          id: item.id,
          label: item.label,
          status: "PENDING" as const,
          requiresMedia:
            assignment.verificationRequest.verificationType.checklistTemplateItems.find(
              (templateItem) => templateItem.sortOrder === item.sortOrder,
            )?.requiresMedia ?? false,
        })),
      };
    });
  } catch (error) {
    logger.error(`Error starting agent assignment assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

export type AgentAssignmentChecklist = {
  checklistItems: {
    id: string;
    label: string;
    status: "PENDING" | "COMPLETE";
    media: { url: string }[];
  }[];
  clientDocuments: {
    id: string;
    fileName: string;
    fileSizeBytes: number;
    url: string;
  }[];
  client: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  additionalNotes: string | null;
  progressPercent: number;
  payment: { status: string; amountInCents: number };
};

export const getAgentAssignmentChecklist = async (
  agentId: string,
  assignmentId: string,
): Promise<AgentAssignmentChecklist | null> => {
  try {
    const assignment = await prismaClient.agentAssignment.findFirst({
      where: { id: assignmentId, agentId },
      select: {
        id: true,
        additionalNotes: true,
        checklistItems: {
          select: {
            id: true,
            label: true,
            status: true,
            media: { select: { url: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
        verificationRequest: {
          select: {
            user: { select: { fullName: true, phone: true, email: true } },
            documents: {
              where: { checklistItemId: null, verificationReportId: null },
              select: { id: true, fileName: true, fileSizeBytes: true, url: true },
              orderBy: { createdAt: "asc" },
            },
            transaction: { select: { status: true, amountInCents: true } },
          },
        },
      },
    });

    if (!assignment) return null;

    const completedItems = assignment.checklistItems.filter(
      (item) => item.status === "COMPLETE",
    ).length;
    const progressPercent = assignment.checklistItems.length
      ? Math.round((completedItems / assignment.checklistItems.length) * 100)
      : 0;
    const names = assignment.verificationRequest.user.fullName.trim().split(/\s+/);
    const transaction = assignment.verificationRequest.transaction;

    return {
      checklistItems: assignment.checklistItems,
      clientDocuments: assignment.verificationRequest.documents,
      client: {
        firstName: names[0] || "",
        lastName: names.slice(1).join(" "),
        phone: assignment.verificationRequest.user.phone ?? "",
        email: assignment.verificationRequest.user.email,
      },
      additionalNotes: assignment.additionalNotes,
      progressPercent,
      payment: transaction
        ? { status: transaction.status, amountInCents: transaction.amountInCents }
        : { status: "PENDING", amountInCents: 0 },
    };
  } catch (error) {
    logger.error(`Error fetching assignment checklist assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

export interface ChecklistMediaData {
  url: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}

export type UpdatedAgentChecklistItem = {
  id: string;
  label: string;
  status: "PENDING" | "COMPLETE";
  media: { url: string }[];
};

export const updateAgentChecklistItem = async (
  agentId: string,
  assignmentId: string,
  itemId: string,
  status: "PENDING" | "COMPLETE",
  media: ChecklistMediaData[] = [],
): Promise<UpdatedAgentChecklistItem | null> => {
  try {
    return await prismaClient.$transaction(async (transaction) => {
      const item = await transaction.verificationChecklistItem.findFirst({
        where: {
          id: itemId,
          agentAssignmentId: assignmentId,
          agentAssignment: { agentId },
        },
        select: {
          id: true,
          agentAssignment: { select: { verificationRequestId: true } },
        },
      });

      if (!item) return null;

      await transaction.verificationChecklistItem.update({
        where: { id: item.id },
        data: { status },
      });

      if (media.length > 0) {
        await transaction.document.createMany({
          data: media.map((file) => ({
            ...file,
            verificationRequestId: item.agentAssignment.verificationRequestId,
            checklistItemId: item.id,
          })),
        });
      }

      const checklistItems = await transaction.verificationChecklistItem.findMany({
        where: { agentAssignmentId: assignmentId },
        select: {
          id: true,
          label: true,
          status: true,
          media: { select: { url: true } },
        },
      });
      const completedItems = checklistItems.filter(
        (checklistItem) => checklistItem.status === "COMPLETE",
      ).length;
      const progressPercent = checklistItems.length
        ? Math.round((completedItems / checklistItems.length) * 100)
        : 0;

      await transaction.agentAssignment.update({
        where: { id: assignmentId },
        data: { progressPercent },
      });

      return checklistItems.find((checklistItem) => checklistItem.id === item.id) ?? null;
    });
  } catch (error) {
    logger.error(
      `Error updating checklist item itemId=${itemId} assignmentId=${assignmentId} ${error}`,
    );
    throw error;
  }
};

export const updateAgentAssignmentNotes = async (
  agentId: string,
  assignmentId: string,
  additionalNotes: string,
): Promise<boolean> => {
  try {
    const result = await prismaClient.agentAssignment.updateMany({
      where: { id: assignmentId, agentId },
      data: { additionalNotes },
    });
    return result.count > 0;
  } catch (error) {
    logger.error(`Error updating assignment notes assignmentId=${assignmentId} ${error}`);
    throw error;
  }
};

const activeAssignmentStatuses: AgentAssignmentStatus[] = [
  AgentAssignmentStatus.ASSIGNED,
  AgentAssignmentStatus.ACCEPTED,
  AgentAssignmentStatus.INSPECTION_SCHEDULED,
];

const completedAssignmentStatuses: AgentAssignmentStatus[] = [
  AgentAssignmentStatus.INSPECTION_COMPLETE,
  AgentAssignmentStatus.REPORT_SUBMITTED,
];

export const getAgentStatsById = async (agentId: string): Promise<AgentSelfStats> => {
  try {
    const [activeCount, completedCount, rating] = await Promise.all([
      prismaClient.agentAssignment.count({
        where: { agentId, status: { in: activeAssignmentStatuses } },
      }),
      prismaClient.agentAssignment.count({
        where: { agentId, status: { in: completedAssignmentStatuses } },
      }),
      prismaClient.verificationReport.aggregate({
        where: { submittedByAgentId: agentId },
        _avg: { rating: true },
      }),
    ]);

    return {
      activeCount,
      completedCount,
      avgRating: Number((rating._avg.rating ?? 0).toFixed(1)),
    };
  } catch (error) {
    logger.error(`Error fetching agent stats agentId=${agentId} ${error}`);
    throw error;
  }
};

export const getAgentAssignmentsById = async (
  agentId: string,
  { limit = 5, status = "ALL", search = "" }: AgentAssignmentsFilter = {},
): Promise<AgentSelfAssignment[]> => {
  try {
    const statuses =
      status === "IN_PROGRESS"
        ? [AgentAssignmentStatus.ACCEPTED, AgentAssignmentStatus.INSPECTION_SCHEDULED]
        : [
            AgentAssignmentStatus.ASSIGNED,
            AgentAssignmentStatus.ACCEPTED,
            AgentAssignmentStatus.INSPECTION_SCHEDULED,
            AgentAssignmentStatus.INSPECTION_COMPLETE,
          ];
    const normalizedSearch = search.trim();

    return await prismaClient.agentAssignment.findMany({
      where: {
        agentId,
        status: { in: statuses },
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
                      name: { contains: normalizedSearch, mode: "insensitive" },
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
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        progressPercent: true,
        scheduledAt: true,
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
    logger.error(`Error fetching agent assignments agentId=${agentId} ${error}`);
    throw error;
  }
};

export const getAllAgentAssignments = async (): Promise<AgentAssignmentInformation[]> => {
  try {
    const assignments = await prismaClient.agentAssignment.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        progressPercent: true,
        additionalNotes: true,
        scheduledAt: true,
        completedAt: true,
        agent: { select: { id: true, name: true, region: true } },
        verificationRequest: {
          select: {
            id: true,
            status: true,
            details: true,
            user: { select: { id: true, fullName: true, email: true } },
            verificationType: { select: { name: true, slug: true } },
          },
        },
        checklistItems: {
          select: { id: true, label: true, status: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    logger.info(`Fetched agent assignments count=${assignments.length}`);
    return assignments;
  } catch (error) {
    logger.error(`Error fetching agent assignments ${error}`);
    throw error;
  }
};

export const getAgentAssignmentStats = async (): Promise<AgentAssignmentStats> => {
  try {
    const [totalAgents, assignments, groupedStatuses] = await Promise.all([
      prismaClient.verificationAgent.count(),
      prismaClient.agentAssignment.findMany({
        select: { agentId: true, progressPercent: true },
      }),
      prismaClient.agentAssignment.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const assignmentsByStatus = Object.values(AgentAssignmentStatus).reduce(
      (result, status) => {
        result[status] = groupedStatuses.find((group) => group.status === status)?._count._all ?? 0;
        return result;
      },
      {} as Record<AgentAssignmentStatus, number>,
    );
    const progressValues = assignments
      .map((assignment) => assignment.progressPercent)
      .filter((progress): progress is number => progress !== null);

    return {
      totalAgents,
      activeAgents: new Set(assignments.map((assignment) => assignment.agentId)).size,
      totalAssignments: assignments.length,
      averageProgressPercent: progressValues.length
        ? Number(
            (
              progressValues.reduce((sum, progress) => sum + progress, 0) / progressValues.length
            ).toFixed(2),
          )
        : 0,
      assignmentsByStatus,
    };
  } catch (error) {
    logger.error(`Error fetching agent assignment stats ${error}`);
    throw error;
  }
};
