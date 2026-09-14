import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  HttpStatusCode,
  BadRequestError,
  InternalServerError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { hashPassword } from "../../../../../utils/password";
import { findValidResetToken, markTokenAsUsed } from "../../../../services/database/password-reset-token";
import { updateClient } from "../../services/database/client";

/**
 * Handler for resetting a user's password using a reset token.
 * - Verifies the token and expiry via the PasswordResetToken database service
 * - Updates the user's password
 * - Marks the token as used
 */
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      logger.warn("Token and password are required for password reset.");
      return next(new BadRequestError("Token and password are required."));
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token.trim())
      .digest("hex");

    const resetRecord = await findValidResetToken(tokenHash);

    if (!resetRecord) {
      logger.warn("Invalid or expired password reset token.");
      return next(new BadRequestError("Token is invalid or has expired."));
    }

    const hashedPassword = await hashPassword(password);

    await updateClient({ id: resetRecord.userId }, { password: hashedPassword });
    logger.info(`Password reset successful for user: ${resetRecord.userId}`);

    await markTokenAsUsed(resetRecord.id);

    return res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    logger.error(`Error in reset password handler: ${error}`);
    next(new InternalServerError("Internal server error"));
  }
};