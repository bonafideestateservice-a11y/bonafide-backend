import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  HttpStatusCode,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { hashPassword } from "../../../../../utils/password";
import { createAgent, findUserByEmail } from "../../services/database/user";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TAKEN = "A user with this email already exists.";

/** Trimmed string, null when blank or missing, undefined when not a string. */
const optionalText = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
};

/** "Add Agent": the admin sets the first password; the agent is asked to change it. */
export const createAgentHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { fullName, email, password } = req.body ?? {};
  const phone = optionalText(req.body?.phone);
  const region = optionalText(req.body?.region);

  if (typeof fullName !== "string" || !fullName.trim()) {
    return next(new BadRequestError("Full name is required."));
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return next(new BadRequestError("A valid email is required."));
  }
  if (typeof password !== "string" || password.length < 8) {
    return next(new BadRequestError("Password must be at least 8 characters."));
  }
  if (phone === undefined || region === undefined) {
    return next(new BadRequestError("phone and region must be strings."));
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    if (await findUserByEmail(normalizedEmail)) return next(new ConflictError(EMAIL_TAKEN));

    const agent = await createAgent({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: await hashPassword(password),
      phone,
      region,
    });
    logger.info(`Agent created: agentId=${agent.id} userId=${agent.userId}`);
    res.status(HttpStatusCode.CREATED).json(agent);
  } catch (error) {
    // Another request created the same email between the check and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return next(new ConflictError(EMAIL_TAKEN));
    }
    logger.error(`Error creating agent: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
