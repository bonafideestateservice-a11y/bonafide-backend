import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { getVerificationAgentByUserId } from "../../services/database/agent";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";

export const getAgentsInformation = async (
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
    const names = agent.user.fullName.trim().split(/\s+/);
    res.status(HttpStatusCode.OK).json({
      id: agent.id,
      firstName: names[0] || "",
      lastName: names.slice(1).join(" "),
    });
  } catch (error) {
    logger.error(`Error getting agents information: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAgentsInformation;
