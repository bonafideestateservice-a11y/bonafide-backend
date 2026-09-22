import { AgentStatus, PropertyStatus, ROLE, VerificationStatus } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { getAdminsByRole } from "../../../authentication/services/database/admin";
import { getAllVerificationAgents } from "../../../authentication/services/database/agent";
import { countPropertiesByStatus } from "./property";

export interface DashboardStats {
  totalUsers: number;
  numberOfPendingRequest: number;
  numberOfActiveAgents: number;
  numberOfProperties: number;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const [clients, agents, pendingRequests, verifiedProperties] = await Promise.all([
    getAdminsByRole(ROLE.CLIENT),
    getAllVerificationAgents(),
    prismaClient.verificationRequest.count({
      where: { status: VerificationStatus.SUBMITTED },
    }),
    countPropertiesByStatus(PropertyStatus.VERIFIED),
  ]);

  return {
    totalUsers: clients.length,
    numberOfPendingRequest: pendingRequests,
    numberOfActiveAgents: agents.filter((agent) => agent.status === AgentStatus.ACTIVE).length,
    numberOfProperties: verifiedProperties,
  };
};
