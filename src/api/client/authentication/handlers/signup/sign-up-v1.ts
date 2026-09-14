import { Request, Response, NextFunction } from "express";
import { ROLE } from "@prisma/client";
import bcrypt from "bcryptjs";

import { createClient, findClient } from "../../services/database/client";
import {
  HttpStatusCode,
  ConflictError,
  ApiError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { generateToken } from "../../../../../utils/jwt";

export const signUp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fullName, email, password, role, termsAndCondition } = req.body;

    // --- Validate required fields ---
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      logger.warn("Missing or invalid fullName in sign-up.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Full name is required."));
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      logger.warn("Missing email in sign-up.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Email is required."));
    }

    if (!password || typeof password !== "string") {
      logger.warn("Missing password in sign-up.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Password is required."));
    }

    if (password.length < 8) {
      logger.warn("Password too short in sign-up.");
      return next(
        new ApiError(HttpStatusCode.BAD_REQUEST, "Password must be at least 8 characters.")
      );
    }

    // --- Check for existing user ---
    const existingUser = await findClient({ email: email.toLowerCase().trim() });

    if (existingUser) {
      logger.warn(`Sign-up attempt with existing email: ${email}`);
      return next(new ConflictError("A user with this email already exists."));
    }

    // --- Resolve role (default to CLIENT) ---
    const resolvedRole: ROLE =
      role && Object.values(ROLE).includes(role as ROLE)
        ? (role as ROLE)
        : ROLE.CLIENT;

    // --- Hash password ---
    const hashedPassword = await bcrypt.hash(password, 10);

    // --- Create user ---
    const user = await createClient({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: resolvedRole,
      termsAndCondition: termsAndCondition === true,
    });

    logger.info(`New user signed up: userId=${user.id} email=${user.email}`);

    // --- Generate access token ---
    const accessToken = generateToken({
      id: user.id,
    });

    // --- Strip password from response ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    res.status(HttpStatusCode.CREATED).json({
      message: "Sign up successful.",
      token: accessToken,
      user: userWithoutPassword,
    });
  } catch (error) {
    logger.error(`Error during user sign-up: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
