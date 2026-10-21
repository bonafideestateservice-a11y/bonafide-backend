import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  HttpStatusCode,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { createAgent } from "../../../verification/services/database/agent-assignment";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** "Add Agent": creates the agent and emails them a code to set their password. */
export const createAgentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { fullName, email, phone, region } = req.body ?? {};
  if (typeof fullName !== "string" || !fullName.trim()) {
    return next(new BadRequestError("fullName is required."));
  }
  if (typeof email !== "string" || !EMAIL.test(email.trim())) {
    return next(new BadRequestError("A valid email is required."));
  }
  for (const [name, value] of Object.entries({ phone, region })) {
    if (value !== undefined && value !== null && typeof value !== "string") {
      return next(new BadRequestError(`${name} must be a string.`));
    }
  }
  try {
    const agent = await createAgent({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: optionalText(phone),
      region: optionalText(region),
    });
    if (!agent) return next(new ConflictError("An account with this email already exists."));
    res.status(HttpStatusCode.CREATED).json(agent);
  } catch (error) {
    logger.error(`Error creating agent: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
