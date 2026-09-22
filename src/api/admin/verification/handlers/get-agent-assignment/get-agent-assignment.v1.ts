import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { getAgentAssignmentById } from "../../services/database/agent-assignment";
import { logger } from "../../../../../utils/logger";

const getNames = (fullName: string) => {
  const names = fullName.trim().split(/\s+/);
  return { firstName: names[0] || "", lastName: names.slice(1).join(" ") };
};

const getAddress = (details: unknown): string => {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return "";
  const record = details as Record<string, unknown>;
  const address = record.propertyAddress ?? record.constructionAddress ?? record.businessAddress;
  return typeof address === "string" ? address : String(address ?? "");
};

export const getAgentAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));
    const assignment = await getAgentAssignmentById(agent.id, req.params.id);
    if (!assignment) return next(new NotFoundError("Assignment not found."));

    const client = getNames(assignment.verificationRequest.user.fullName);
    const transaction = assignment.verificationRequest.transactions[0];
    res.status(HttpStatusCode.OK).json({
      id: assignment.id,
      status: assignment.status,
      verificationType: assignment.verificationRequest.verificationType,
      address: getAddress(assignment.verificationRequest.details),
      client: {
        ...client,
        phone: assignment.verificationRequest.user.phone ?? "",
        email: assignment.verificationRequest.user.email,
      },
      payment: transaction ?? {
        status: "PENDING",
        amountInCents: 0,
        currency: "USD",
      },
      scheduledAt: assignment.scheduledAt?.toISOString() ?? null,
    });
  } catch (error) {
    logger.error(`Error getting agent assignment detail: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAgentAssignment;
