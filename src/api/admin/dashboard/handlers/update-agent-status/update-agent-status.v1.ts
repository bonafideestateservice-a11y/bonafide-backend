import { AgentStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { setAgentStatus } from "../../../verification/services/database/agent-assignment";

/** "Suspend Agent" (INACTIVE) or reactivate (ACTIVE). */
export const updateAgentStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const status = req.body?.status;
  if (status !== AgentStatus.ACTIVE && status !== AgentStatus.INACTIVE) {
    return next(new BadRequestError("status must be ACTIVE or INACTIVE."));
  }
  try {
    const result = await setAgentStatus(req.params.id, status);
    if (!result) return next(new NotFoundError("Verification agent not found."));
    res.status(HttpStatusCode.OK).json(result);
  } catch (error) {
    logger.error(`Error updating agent status: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
