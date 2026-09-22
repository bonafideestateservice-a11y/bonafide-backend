import { Prisma } from "@prisma/client";
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
