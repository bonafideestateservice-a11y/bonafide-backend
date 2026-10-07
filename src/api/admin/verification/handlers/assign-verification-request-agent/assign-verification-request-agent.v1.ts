import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { assignAgentToVerificationRequest } from "../../services/database/agent-assignment";
import { logger } from "../../../../../utils/logger";

export const assignVerificationRequestAgent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { agentId } = req.body ?? {};
    if (typeof agentId !== "string" || !agentId.trim()) {
      return next(new BadRequestError("agentId is required and must be a non-empty string."));
    }

    const result = await assignAgentToVerificationRequest(req.params.id, agentId.trim());

    switch (result.kind) {
      case "REQUEST_NOT_FOUND":
        return next(new NotFoundError("Verification request not found."));
      case "AGENT_NOT_FOUND":
        return next(new NotFoundError("Verification agent not found."));
      case "AGENT_INACTIVE":
        return next(new BadRequestError("Verification agent is inactive."));
      case "AGENT_FULLY_BOOKED":
        return next(
          new ConflictError(
            "Agent is fully booked. Agents can only handle 5 properties at a time.",
          ),
        );
      case "ALREADY_ASSIGNED":
        return next(new ConflictError("Verification request already has an assigned agent."));
      case "NO_PAID_PERIOD":
        return next(
          new ConflictError("Verification request has no paid period awaiting an agent."),
        );
      case "REQUEST_NOT_ASSIGNABLE":
        return next(
          new ConflictError(
            `Only paid verification requests awaiting an agent can be assigned (current status: ${result.status}).`,
          ),
        );
    }

    const { assignment } = result;
    res.status(HttpStatusCode.CREATED).json({
      id: assignment.id,
      verificationRequestId: req.params.id,
      status: assignment.status,
      agent: assignment.agent,
      createdAt: assignment.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error(`Error assigning verification request agent: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default assignVerificationRequestAgent;
