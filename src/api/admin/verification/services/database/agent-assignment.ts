import { AgentAssignmentStatus, AgentStatus, Prisma, VerificationStatus } from "@prisma/client";
import { appEvents, AppEventTypes } from "../../../../../events";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import { findUnreportedPaidTransaction } from "../../../../services/database/verification-lifecycle";
import {
  MAX_ACTIVE_ASSIGNMENTS,
  OPEN_ASSIGNMENT_STATUSES,
} from "../../../authentication/services/database/agent";

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

export interface CreateAgentAssignmentData {
  verificationRequestId: string;
  agentId: string;
}

export const createAgentAssignment = async ({
  verificationRequestId,
  agentId,
}: CreateAgentAssignmentData) => {
  try {
    const paidPeriod = await findUnreportedPaidTransaction(prismaClient, verificationRequestId);
    const assignment = await prismaClient.agentAssignment.create({
      data: { verificationRequestId, agentId, transactionId: paidPeriod?.id ?? null },
    });
    if (paidPeriod) {
      await prismaClient.transaction.update({
        where: { id: paidPeriod.id },
        data: { assignedAt: new Date() },
      });
    }

    appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
      assignmentId: assignment.id,
      verificationRequestId: assignment.verificationRequestId,
      agentId: assignment.agentId,
    });

    return assignment;
  } catch (error) {
    logger.error(
      `Error creating agent assignment verificationRequestId=${verificationRequestId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

const assignedAgentSelect = {
  id: true,
  status: true,
  createdAt: true,
  agent: { select: { id: true, name: true } },
} satisfies Prisma.AgentAssignmentSelect;

export type AssignAgentResult =
  | { kind: "REQUEST_NOT_FOUND" }
  | { kind: "AGENT_NOT_FOUND" }
  | { kind: "AGENT_INACTIVE" }
  | { kind: "AGENT_FULLY_BOOKED" }
  | { kind: "REQUEST_NOT_ASSIGNABLE"; status: VerificationStatus }
  | { kind: "NO_PAID_PERIOD" }
  | { kind: "ALREADY_ASSIGNED"; agentId: string }
  | {
      kind: "ASSIGNED";
      assignment: Prisma.AgentAssignmentGetPayload<{ select: typeof assignedAgentSelect }>;
    };

/**
 * Assign an agent to a paid verification request. Only SUBMITTED requests (paid
 * and waiting for an agent) can be assigned; the request moves to IN_PROGRESS.
 * The assignment covers the oldest paid period that has no report yet.
 */
export const assignAgentToVerificationRequest = async (
  verificationRequestId: string,
  agentId: string,
): Promise<AssignAgentResult> => {
  try {
    const result = await prismaClient.$transaction(async (transaction) => {
      const verificationRequest = await transaction.verificationRequest.findUnique({
        where: { id: verificationRequestId },
        select: { status: true, agentAssignment: { select: { agentId: true } } },
      });
      if (!verificationRequest) return { kind: "REQUEST_NOT_FOUND" as const };

      if (verificationRequest.agentAssignment) {
        return {
          kind: "ALREADY_ASSIGNED" as const,
          agentId: verificationRequest.agentAssignment.agentId,
        };
      }

      if (verificationRequest.status !== VerificationStatus.SUBMITTED) {
        return { kind: "REQUEST_NOT_ASSIGNABLE" as const, status: verificationRequest.status };
      }

      const agent = await transaction.verificationAgent.findUnique({
        where: { id: agentId },
        select: { status: true },
      });
      if (!agent) return { kind: "AGENT_NOT_FOUND" as const };
      if (agent.status !== AgentStatus.ACTIVE) return { kind: "AGENT_INACTIVE" as const };
      const openJobs = await transaction.agentAssignment.count({
        where: { agentId, status: { in: OPEN_ASSIGNMENT_STATUSES } },
      });
      if (openJobs >= MAX_ACTIVE_ASSIGNMENTS) return { kind: "AGENT_FULLY_BOOKED" as const };

      const paidPeriod = await findUnreportedPaidTransaction(transaction, verificationRequestId);
      if (!paidPeriod) return { kind: "NO_PAID_PERIOD" as const };

      // Guards against the status changing (e.g. a refund) since it was read.
      const moved = await transaction.verificationRequest.updateMany({
        where: { id: verificationRequestId, status: VerificationStatus.SUBMITTED },
        data: { status: VerificationStatus.IN_PROGRESS },
      });
      if (moved.count === 0) {
        return { kind: "REQUEST_NOT_ASSIGNABLE" as const, status: verificationRequest.status };
      }

      const assignment = await transaction.agentAssignment.create({
        data: { verificationRequestId, agentId, transactionId: paidPeriod.id },
        select: assignedAgentSelect,
      });
      await transaction.transaction.update({
        where: { id: paidPeriod.id },
        data: { assignedAt: new Date() },
      });
      return { kind: "ASSIGNED" as const, assignment };
    });

    if (result.kind === "ASSIGNED") {
      appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
        assignmentId: result.assignment.id,
        verificationRequestId,
        agentId,
      });
      logger.info(
        `Agent assigned verificationRequestId=${verificationRequestId} agentId=${agentId} assignmentId=${result.assignment.id}`,
      );
    }

    return result;
  } catch (error) {
    // Two admins assigning at once: the unique constraint on verificationRequestId wins.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prismaClient.agentAssignment.findUnique({
        where: { verificationRequestId },
        select: { agentId: true },
      });
      return { kind: "ALREADY_ASSIGNED", agentId: existing?.agentId ?? agentId };
    }
    logger.error(
      `Error assigning agent verificationRequestId=${verificationRequestId} agentId=${agentId} ${error}`,
    );
    throw error;
  }
};

export type UnassignAgentResult = "UNASSIGNED" | "NOT_ASSIGNED" | "REPORT_SUBMITTED";

/**
 * Remove the agent from a request that hasn't been reported yet. The paid period goes back to
 * waiting for an agent (request SUBMITTED, the payment's assignedAt cleared) and any checklist
 * progress is discarded.
 */
export const unassignAgentFromVerificationRequest = (verificationRequestId: string) =>
  prismaClient.$transaction(async (transaction): Promise<UnassignAgentResult> => {
    const assignment = await transaction.agentAssignment.findUnique({
      where: { verificationRequestId },
      select: { id: true, status: true, transactionId: true },
    });
    if (!assignment) return "NOT_ASSIGNED";
    if (
      assignment.status === AgentAssignmentStatus.INSPECTION_COMPLETE ||
      assignment.status === AgentAssignmentStatus.REPORT_SUBMITTED
    ) {
      return "REPORT_SUBMITTED";
    }

    await transaction.verificationChecklistItem.deleteMany({
      where: { agentAssignmentId: assignment.id },
    });
    await transaction.agentAssignment.delete({ where: { id: assignment.id } });
    if (assignment.transactionId) {
      await transaction.transaction.update({
        where: { id: assignment.transactionId },
        data: { assignedAt: null },
      });
    }
    await transaction.verificationRequest.updateMany({
      where: { id: verificationRequestId, status: VerificationStatus.IN_PROGRESS },
      data: { status: VerificationStatus.SUBMITTED },
    });
    return "UNASSIGNED";
  });

/**
 * Suspend (INACTIVE) or reactivate (ACTIVE) an agent. Suspending moves each open assignment to
 * the active agent with the fewest open jobs who still has room; when nobody has room, the job is
 * unassigned so an admin can assign it later. Null when the agent doesn't exist.
 */
export const setAgentStatus = async (agentId: string, status: AgentStatus) => {
  const agent = await prismaClient.verificationAgent.findUnique({ where: { id: agentId } });
  if (!agent) return null;

  await prismaClient.verificationAgent.update({
    where: { id: agentId },
    data: { status, deactivatedAt: status === AgentStatus.INACTIVE ? new Date() : null },
  });
  const result = { id: agentId, status, reassigned: 0, unassigned: 0 };
  if (status === AgentStatus.ACTIVE) return result;

  const [openAssignments, others] = await Promise.all([
    prismaClient.agentAssignment.findMany({
      where: { agentId, status: { in: OPEN_ASSIGNMENT_STATUSES } },
      select: { id: true, verificationRequestId: true },
    }),
    prismaClient.verificationAgent.findMany({
      where: { id: { not: agentId }, status: AgentStatus.ACTIVE },
      select: {
        id: true,
        _count: {
          select: { assignments: { where: { status: { in: OPEN_ASSIGNMENT_STATUSES } } } },
        },
      },
    }),
  ]);
  const load = new Map(others.map((other) => [other.id, other._count.assignments]));

  for (const assignment of openAssignments) {
    const [next] = [...load]
      .filter(([, jobs]) => jobs < MAX_ACTIVE_ASSIGNMENTS)
      .sort((a, b) => a[1] - b[1]);
    if (!next) {
      await unassignAgentFromVerificationRequest(assignment.verificationRequestId);
      result.unassigned += 1;
      continue;
    }
    // The new agent starts the inspection afresh.
    await prismaClient.$transaction([
      prismaClient.verificationChecklistItem.deleteMany({
        where: { agentAssignmentId: assignment.id },
      }),
      prismaClient.agentAssignment.update({
        where: { id: assignment.id },
        data: { agentId: next[0], status: AgentAssignmentStatus.ASSIGNED, progressPercent: null },
      }),
    ]);
    load.set(next[0], next[1] + 1);
    result.reassigned += 1;
    appEvents.emit(AppEventTypes.AGENT_ASSIGNED, {
      assignmentId: assignment.id,
      verificationRequestId: assignment.verificationRequestId,
      agentId: next[0],
    });
  }
  return result;
};

export type AgentAssignmentDetail = Prisma.AgentAssignmentGetPayload<{
  select: {
    id: true;
    status: true;
    scheduledAt: true;
    agentId: true;
    transaction: { select: { status: true; amountInCents: true; currency: true } };
    verificationRequest: {
      select: {
        details: true;
        user: { select: { fullName: true; phone: true; email: true } };
        verificationType: { select: { name: true } };
        transactions: {
          select: { status: true; amountInCents: true; currency: true };
          orderBy: { createdAt: "desc" };
          take: 1;
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
        transaction: { select: { status: true, amountInCents: true, currency: true } },
        verificationRequest: {
          select: {
            details: true,
            user: { select: { fullName: true, phone: true, email: true } },
            verificationType: { select: { name: true } },
            transactions: {
              select: { status: true, amountInCents: true, currency: true },
              orderBy: { createdAt: "desc" },
              take: 1,
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
    let startedEvent: { assignmentId: string; verificationRequestId: string } | undefined;
    const result = await prismaClient.$transaction(async (transaction) => {
      const assignment = await transaction.agentAssignment.findFirst({
        where: { id: assignmentId, agentId },
        select: {
          id: true,
          verificationRequestId: true,
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

      if (status === AgentAssignmentStatus.ACCEPTED) {
        startedEvent = {
          assignmentId: assignment.id,
          verificationRequestId: assignment.verificationRequestId,
        };
      }

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

    if (startedEvent) {
      appEvents.emit(AppEventTypes.INSPECTION_STARTED, {
        ...startedEvent,
        agentId,
      });
    }

    return result;
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
        transaction: { select: { status: true, amountInCents: true } },
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
            transactions: {
              select: { status: true, amountInCents: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
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
    // The payment for this assignment's period; older assignments fall back to the latest.
    const transaction = assignment.transaction ?? assignment.verificationRequest.transactions[0];

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

      if (!item?.agentAssignment) return null;
      const { verificationRequestId } = item.agentAssignment;

      await transaction.verificationChecklistItem.update({
        where: { id: item.id },
        data: { status },
      });

      if (media.length > 0) {
        await transaction.document.createMany({
          data: media.map((file) => ({
            ...file,
            verificationRequestId,
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

export const getAgentStatsById = async (agentId: string): Promise<AgentSelfStats> => {
  try {
    const [activeCount, completedCount, rating] = await Promise.all([
      prismaClient.agentAssignment.count({
        where: { agentId, status: { in: activeAssignmentStatuses } },
      }),
      // Reports, not assignments: recurring assignments are deleted after each period.
      prismaClient.verificationReport.count({ where: { submittedByAgentId: agentId } }),
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
