import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { getAgentAssignmentsById } from "../../services/database/agent-assignment";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { BadRequestError, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";

export const getAgentsAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    const limit = req.query.limit === undefined ? 5 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return next(new BadRequestError("Limit must be an integer between 1 and 50."));
    }
    const status = req.query.status === undefined ? "ALL" : req.query.status;
    if (status !== "ALL" && status !== "IN_PROGRESS") {
      return next(new BadRequestError("Status must be ALL or IN_PROGRESS."));
    }
    const search = typeof req.query.search === "string" ? req.query.search : "";
    if (req.query.search !== undefined && typeof req.query.search !== "string") {
      return next(new BadRequestError("Search must be a string."));
    }
    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));
    const assignments = await getAgentAssignmentsById(agent.id, {
      limit,
      status: status as "ALL" | "IN_PROGRESS",
      search,
    });
    res.status(HttpStatusCode.OK).json(
      assignments.map((assignment) => {
        const details = assignment.verificationRequest.details;
        const address =
          typeof details === "object" && details !== null && !Array.isArray(details)
            ? ((details as Record<string, unknown>).propertyAddress ??
              (details as Record<string, unknown>).constructionAddress ??
              (details as Record<string, unknown>).businessAddress ??
              "")
            : "";
        const names = assignment.verificationRequest.user.fullName.trim().split(/\s+/);
        return {
          id: assignment.id,
          verificationType: assignment.verificationRequest.verificationType,
          client: {
            firstName: names[0] || "",
            lastName: names.slice(1).join(" "),
          },
          address: typeof address === "string" ? address : String(address),
          status: assignment.status,
          progressPercent: assignment.progressPercent,
          scheduledAt: assignment.scheduledAt?.toISOString() ?? null,
        };
      }),
    );
  } catch (error) {
    logger.error(`Error getting agent assignments: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAgentsAssignments;
