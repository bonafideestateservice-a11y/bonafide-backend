import { Request, Response, NextFunction } from "express";
import {
  HttpStatusCode,
  ApiError,
  UnauthorizedError,
  NotFoundError,
} from "../../../../../exceptions";
import { findAdmin, updateAdmin } from "../../services/database/admin";
import { logger } from "../../../../../utils/logger";
import { hashPassword, verifyPassword } from "../../../../../utils/password";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

/**
 * Change password handler for authenticated admins.
 */

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const tokenPayload = customReq.token;

    // --- Guard: token must be present (set by checkJwt middleware) ---
    if (!tokenPayload?.id) {
      logger.warn("changePassword called without a valid token payload.");
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // --- Validate required fields ---
    if (!currentPassword || !newPassword || !confirmPassword) {
      logger.warn("Missing password fields in change password request.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "All password fields are required."));
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      logger.warn("New password does not meet length requirements.");
      return next(
        new ApiError(HttpStatusCode.BAD_REQUEST, "New password must be at least 8 characters."),
      );
    }

    if (newPassword !== confirmPassword) {
      logger.warn("New password and confirmation do not match.");
      return next(
        new ApiError(HttpStatusCode.BAD_REQUEST, "New password and confirmation do not match."),
      );
    }

    // --- Fetch admin from database ---
    const admin = await findAdmin({ id: tokenPayload.id });

    if (!admin) {
      logger.warn(`changePassword: admin not found for id=${tokenPayload.id}`);
      return next(new NotFoundError("Admin not found."));
    }

    // --- Verify current password ---
    if (!admin.password) {
      logger.warn(`changePassword called for admin without local password id=${admin.id}`);
      return next(
        new ApiError(
          HttpStatusCode.BAD_REQUEST,
          "This account does not have a local password to change.",
        ),
      );
    }

    const isMatch = await verifyPassword(currentPassword, admin.password);

    if (!isMatch) {
      logger.warn(`Incorrect current password for adminId=${admin.id}`);
      return next(new UnauthorizedError("Current password is incorrect."));
    }

    // --- Hash and update new password ---
    const hashedPassword = await hashPassword(newPassword);

    await updateAdmin({ id: admin.id }, { password: hashedPassword });

    logger.info(`Password successfully changed for adminId=${admin.id}`);

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password has been changed successfully.",
    });
  } catch (error) {
    logger.error(`Error changing password: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
