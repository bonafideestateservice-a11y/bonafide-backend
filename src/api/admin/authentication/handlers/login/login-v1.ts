import { Request, Response, NextFunction } from "express";

import { findAdmin } from "../../services/database/admin";
import {
  HttpStatusCode,
  NotFoundError,
  ApiError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { verifyPassword } from "../../../../../utils/password";
import { generateToken } from "../../../../../utils/jwt";
import { ROLE } from "@prisma/client";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // --- Validate required fields ---
    if (!email || typeof email !== "string" || !email.trim()) {
      logger.warn("Missing email in admin login.");
      return next(
        new ApiError(HttpStatusCode.BAD_REQUEST, "Email is required."),
      );
    }

    if (!password || typeof password !== "string") {
      logger.warn("Missing password in admin login.");
      return next(
        new ApiError(HttpStatusCode.BAD_REQUEST, "Password is required."),
      );
    }

    // --- Find admin ---
    const admin = await findAdmin({ email: email.toLowerCase().trim() });

    if (!admin) {
      logger.warn(`Admin login attempt with unknown email: ${email}`);
      return next(new NotFoundError("Admin not found."));
    }

    // --- Verify role ---
    if (admin.role !== ROLE.ADMIN && admin.role !== ROLE.AGENT) {
      logger.warn(`Unauthorized role login attempt for email: ${email}`);
      return next(
        new ApiError(HttpStatusCode.FORBIDDEN, "Insufficient permissions."),
      );
    }

    // --- Verify password ---
    if (!admin.password) {
      logger.warn(`Admin login attempt without local password: ${email}`);
      return next(
        new ApiError(
          HttpStatusCode.UNAUTHORIZED,
          "This account does not have a local password configured.",
        ),
      );
    }

    const isPasswordValid = await verifyPassword(password, admin.password);

    if (!isPasswordValid) {
      logger.warn(`Invalid password attempt for admin: ${email}`);
      return next(
        new ApiError(HttpStatusCode.UNAUTHORIZED, "Invalid credentials."),
      );
    }

    // --- Generate access token ---
    const accessToken = generateToken({
      id: admin.id,
    });

    // --- Strip password from response ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...adminWithoutPassword } = admin;

    res.status(HttpStatusCode.OK).json({
      message: "Login successful.",
      token: accessToken,
      user: adminWithoutPassword,
    });
  } catch (error) {
    logger.error(`Error during admin login: ${error}`);
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};
