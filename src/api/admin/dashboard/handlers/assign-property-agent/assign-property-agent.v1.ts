import { AgentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  countAgentProperties,
  findAgentStatus,
  MAX_AGENT_PROPERTIES,
  setPropertyAgent,
} from "../../services/database/property";

/** "Assign Property" on the Agent Profile page. Replaces any agent already on the property. */
export const assignPropertyAgentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const agentId = typeof req.body?.agentId === "string" ? req.body.agentId.trim() : "";
  if (!agentId) return next(new BadRequestError("agentId is required."));
  try {
    const agent = await findAgentStatus(agentId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));
    if (agent.status === AgentStatus.INACTIVE) {
      return next(new BadRequestError("Verification agent is inactive."));
    }
    if ((await countAgentProperties(agentId, req.params.id)) >= MAX_AGENT_PROPERTIES) {
      return next(
        new ConflictError(
          `Agent is fully booked. Agents can only handle ${MAX_AGENT_PROPERTIES} properties at a time.`,
        ),
      );
    }
    const property = await setPropertyAgent(req.params.id, agentId);
    res
      .status(HttpStatusCode.OK)
      .json({ ...property, updatedAt: property.updatedAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return next(new NotFoundError("Property not found."));
    }
    logger.error(`Error assigning property agent: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
