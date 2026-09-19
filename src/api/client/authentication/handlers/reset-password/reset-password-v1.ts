import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { HttpStatusCode, BadRequestError, InternalServerError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { hashPassword } from "../../../../../utils/password";
import {
  findValidResetToken,
  markTokenAsUsed,
} from "../../../../services/database/password-reset-token";
import { findClient, updateClient } from "../../services/database/client";

/**
 * Handler for resetting a user's password using a reset OTP.
 * - Verifies the OTP and expiry via the PasswordResetToken database service
 * - Verifies the OTP belongs to the provided email
 * - Updates the user's password
 * - Marks the OTP as used
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      logger.warn("Email, OTP, and password are required for password reset.");
      return next(new BadRequestError("Email, OTP, and password are required."));
    }

    const user = await findClient({ email: email.toLowerCase().trim() });
    if (!user) {
      return next(new BadRequestError("Invalid email or OTP."));
    }

    const tokenHash = crypto.createHash("sha256").update(otp.trim()).digest("hex");

    const resetRecord = await findValidResetToken(tokenHash);

    if (!resetRecord || resetRecord.userId !== user.id) {
      logger.warn(`Invalid or expired password reset OTP for email: ${email}`);
      return next(new BadRequestError("OTP is invalid or has expired."));
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
