import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { getAgentStatsById } from "../../services/database/agent-assignment";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";

export const getAgentsStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));
    const stats = await getAgentStatsById(agent.id);
    res.status(HttpStatusCode.OK).json(stats);
  } catch (error) {
    logger.error(`Error getting agent stats: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAgentsStats;
