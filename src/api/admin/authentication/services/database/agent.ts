import { AgentAssignmentStatus, Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export type VerificationAgentInformation = Prisma.VerificationAgentGetPayload<{
  select: {
    id: true;
    userId: true;
    name: true;
    phone: true;
    region: true;
    status: true;
    createdAt: true;
    updatedAt: true;
    user: { select: { fullName: true; email: true; role: true } };
    _count: { select: { assignments: true } };
  };
}>;

export const getAllVerificationAgents = async (): Promise<VerificationAgentInformation[]> => {
  try {
    const agents = await prismaClient.verificationAgent.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        name: true,
        phone: true,
        region: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { fullName: true, email: true, role: true } },
        _count: { select: { assignments: true } },
      },
    });
    logger.info(`Fetched verification agents count=${agents.length}`);
    return agents;
  } catch (error) {
    logger.error(`Error fetching verification agents ${error}`);
    throw error;
  }
};

export type VerificationAgentSelf = Prisma.VerificationAgentGetPayload<{
  select: {
    id: true;
    user: { select: { fullName: true } };
  };
}>;

export const getVerificationAgentByUserId = async (
  userId: string,
): Promise<VerificationAgentSelf | null> => {
  try {
    return await prismaClient.verificationAgent.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true } } },
    });
  } catch (error) {
    logger.error(`Error finding verification agent userId=${userId} ${error}`);
    throw error;
  }
};

/** An agent with this many open assignments is fully booked. */
export const MAX_ACTIVE_ASSIGNMENTS = 5;

export const OPEN_ASSIGNMENT_STATUSES = [
  AgentAssignmentStatus.ASSIGNED,
  AgentAssignmentStatus.ACCEPTED,
  AgentAssignmentStatus.INSPECTION_SCHEDULED,
];

/** Every agent matching the search, with their email and number of open assignments. */
export const listVerificationAgents = (search = "") =>
  prismaClient.verificationAgent.findMany({
    where: search.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: "insensitive" } },
            { region: { contains: search.trim(), mode: "insensitive" } },
            { user: { email: { contains: search.trim(), mode: "insensitive" } } },
          ],
        }
      : {},
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      region: true,
      status: true,
      user: { select: { email: true, profilePhoto: true } },
      _count: {
        select: {
          assignments: { where: { status: { in: OPEN_ASSIGNMENT_STATUSES } } },
          properties: { where: { deletedAt: null } },
        },
      },
    },
  });
