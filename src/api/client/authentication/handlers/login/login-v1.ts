import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";

import { findClient } from "../../services/database/client";
import {
  HttpStatusCode,
  NotFoundError,
  ApiError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { generateToken } from "../../../../../utils/jwt";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // --- Validate required fields ---
    if (!email || typeof email !== "string" || !email.trim()) {
      logger.warn("Missing email in login.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Email is required."));
    }

    if (!password || typeof password !== "string") {
      logger.warn("Missing password in login.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Password is required."));
    }

    // --- Find user ---
    const user = await findClient({ email: email.toLowerCase().trim() });

    if (!user) {
      logger.warn(`Login attempt with unknown email: ${email}`);
      return next(new NotFoundError("User not found."));
    }

    // --- Verify password ---
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      logger.warn(`Invalid password attempt for user: ${email}`);
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Invalid credentials."));
    }

    // --- Generate access token ---
    const accessToken = generateToken({
      id: user.id,
    });

    // --- Strip password from response ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    res.status(HttpStatusCode.OK).json({
      message: "Login successful.",
      token: accessToken,
      user: userWithoutPassword,
    });
  } catch (error) {
    logger.error(`Error during user login: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
