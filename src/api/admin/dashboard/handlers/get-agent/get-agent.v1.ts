import { AgentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { MAX_AGENT_PROPERTIES } from "../../services/database/property";
import { getAgentProfile } from "../../services/database/user";
import { displayStatusOf } from "../get-agents/get-agents.v1";
import { toPropertyResponse } from "../get-all-properties/get-all-properties.v1";

/** The Agent Profile page. */
export const getAgentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const profile = await getAgentProfile(req.params.id);
    if (!profile) return next(new NotFoundError("Verification agent not found."));
    const { agent, suspended, activeAssignments, properties, stats } = profile;
    res.status(HttpStatusCode.OK).json({
      id: agent.id,
      userId: agent.user.id,
      name: agent.name,
      email: agent.user.email,
      phone: agent.phone ?? agent.user.phone,
      region: agent.region,
      avatarUrl: agent.user.profilePhoto,
      displayStatus: displayStatusOf(
        suspended ? AgentStatus.INACTIVE : agent.status,
        activeAssignments,
      ),
      // The "4/5 Properties Assigned" badge.
      assignedPropertyCount: properties.length,
      maxAssignedProperties: MAX_AGENT_PROPERTIES,
      memberSince: agent.createdAt.toISOString(),
      stats,
      assignedProperties: properties.map(toPropertyResponse),
    });
  } catch (error) {
    logger.error(`Error getting agent profile: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
