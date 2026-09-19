import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  HttpStatusCode,
  NotFoundError,
  UnauthorizedError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { findAdmin, updateAdminEmail } from "../../services/database/admin";
import { verifyPassword } from "../../../../../utils/password";
import { logger } from "../../../../../utils/logger";

export const changeEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));

    const { newEmail, password, currentPassword } = req.body as {
      newEmail?: unknown;
      password?: unknown;
      currentPassword?: unknown;
    };
    const confirmationPassword = currentPassword ?? password;
    if (typeof newEmail !== "string" || !newEmail.trim()) {
      return next(new BadRequestError("New email is required."));
    }
    if (typeof confirmationPassword !== "string" || !confirmationPassword) {
      return next(new BadRequestError("Password confirmation is required."));
    }

    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new BadRequestError("A valid email is required."));
    }

    const admin = await findAdmin({ id: userId });
    if (!admin) return next(new NotFoundError("Profile not found."));
    if (!admin.password) {
      return next(new BadRequestError("This account does not have a local password."));
    }
    if (!(await verifyPassword(confirmationPassword, admin.password))) {
      return next(new UnauthorizedError("Password is incorrect."));
    }

    const profile = await updateAdminEmail(userId, email);
    res.status(HttpStatusCode.OK).json(profile);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return next(new ConflictError("Email is already in use."));
    }
    logger.error(`Error changing admin email: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default changeEmail;
