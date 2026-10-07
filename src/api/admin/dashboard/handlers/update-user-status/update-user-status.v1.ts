import { AgentStatus, ROLE, UserStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { setAgentStatus } from "../../../verification/services/database/agent-assignment";
import { findUserForStatusChange, setUserStatus } from "../../services/database/user";

/** "Suspend User" or reactivate. Suspended users can't log in. */
export const updateUserStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const status = req.body?.status;
  if (status !== UserStatus.ACTIVE && status !== UserStatus.SUSPENDED) {
    return next(new BadRequestError("status must be ACTIVE or SUSPENDED."));
  }
  try {
    const user = await findUserForStatusChange(req.params.id);
    if (!user || user.role === ROLE.ADMIN) return next(new NotFoundError("User not found."));

    // Suspending an agent also moves their open jobs, like "Suspend Agent".
    const moved = user.verificationAgent
      ? await setAgentStatus(
          user.verificationAgent.id,
          status === UserStatus.SUSPENDED ? AgentStatus.INACTIVE : AgentStatus.ACTIVE,
        )
      : await setUserStatus(user.id, status);
    res.status(HttpStatusCode.OK).json({
      id: user.id,
      status,
      reassigned: moved && "reassigned" in moved ? moved.reassigned : 0,
      unassigned: moved && "unassigned" in moved ? moved.unassigned : 0,
    });
  } catch (error) {
    logger.error(`Error updating user status: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
