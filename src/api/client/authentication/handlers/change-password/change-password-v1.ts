import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { HttpStatusCode, ApiError, UnauthorizedError, NotFoundError } from "../../../../../exceptions";
import { findClient, updateClient } from "../../services/database/client";
import { logger } from "../../../../../utils/logger";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

/**
 * Change password handler for authenticated users.
 * - Reads the authenticated user identity from the JWT token attached by checkJwt middleware
 * - Verifies the current password against the stored hash
 * - Validates that the new password and confirmation match
 * - Updates the user's password in the database
*/

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
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
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "New password must be at least 8 characters."));
    }

    if (newPassword !== confirmPassword) {
      logger.warn("New password and confirmation do not match.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "New password and confirmation do not match."));
    }

    // --- Fetch user from database ---
    const user = await findClient({ id: tokenPayload.id });

    if (!user) {
      logger.warn(`changePassword: user not found for id=${tokenPayload.id}`);
      return next(new NotFoundError("User not found."));
    }

    // --- Verify current password ---
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      logger.warn(`Incorrect current password for userId=${user.id}`);
      return next(new UnauthorizedError("Current password is incorrect."));
    }

    // --- Hash and update new password ---
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await updateClient({ id: user.id }, { password: hashedPassword });

    logger.info(`Password successfully changed for userId=${user.id}`);

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password has been changed successfully.",
    });
  } catch (error) {
    logger.error(`Error changing password: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
