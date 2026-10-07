import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getVerificationRequestForAdmin } from "../../services/database/verification-request";
import { getDisplayStatus } from "../get-verification-requests/get-verification-requests.v1";

/** One verification request for the admin detail view. */
export const getVerificationRequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await getVerificationRequestForAdmin(req.params.id);
    if (!request) return next(new NotFoundError("Verification request not found."));

    const { user, agentAssignment, verificationPlan, transactions, reports } = request;
    res.status(HttpStatusCode.OK).json({
      id: request.id,
      status: getDisplayStatus(request),
      client: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.profilePhoto,
      },
      verificationType: request.verificationType.name,
      plan: verificationPlan,
      details: request.details,
      agent: agentAssignment
        ? { ...agentAssignment.agent, assignmentStatus: agentAssignment.status }
        : null,
      payments: transactions,
      reports: reports.map(({ agent, ...report }) => ({ ...report, agentName: agent.name })),
      createdAt: request.createdAt,
    });
  } catch (error) {
    logger.error(`Error getting verification request: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
