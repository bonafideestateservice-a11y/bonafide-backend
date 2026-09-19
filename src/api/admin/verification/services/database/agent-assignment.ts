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

const activeAssignmentStatuses: AgentAssignmentStatus[] = [
  AgentAssignmentStatus.ASSIGNED,
  AgentAssignmentStatus.ACCEPTED,
  AgentAssignmentStatus.INSPECTION_SCHEDULED,
];

const completedAssignmentStatuses: AgentAssignmentStatus[] = [
  AgentAssignmentStatus.INSPECTION_COMPLETE,
  AgentAssignmentStatus.REPORT_SUBMITTED,
];

export const getAgentStatsById = async (
  agentId: string,
): Promise<AgentSelfStats> => {
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
  limit = 5,
): Promise<AgentSelfAssignment[]> => {
  try {
    return await prismaClient.agentAssignment.findMany({
      where: { agentId },
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

export const getAllAgentAssignments = async (): Promise<
  AgentAssignmentInformation[]
> => {
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

export const getAgentAssignmentStats =
  async (): Promise<AgentAssignmentStats> => {
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
          result[status] =
            groupedStatuses.find((group) => group.status === status)?._count
              ._all ?? 0;
          return result;
        },
        {} as Record<AgentAssignmentStatus, number>,
      );
      const progressValues = assignments
        .map((assignment) => assignment.progressPercent)
        .filter((progress): progress is number => progress !== null);

      return {
        totalAgents,
        activeAgents: new Set(
          assignments.map((assignment) => assignment.agentId),
        ).size,
        totalAssignments: assignments.length,
        averageProgressPercent: progressValues.length
          ? Number(
              (
                progressValues.reduce((sum, progress) => sum + progress, 0) /
                progressValues.length
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
