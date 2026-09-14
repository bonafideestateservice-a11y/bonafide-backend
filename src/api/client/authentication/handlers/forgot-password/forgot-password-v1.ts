import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { generateNumericOTP } from "../../../../../utils/otp";
import { HttpStatusCode, NotFoundError, ApiError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { appEvents, AppEventTypes } from "../../../../../events";
import { findClient } from "../../services/database/client";
import { createPasswordResetToken as persistPasswordResetToken } from "../../../../services/database/password-reset-token";

/**
 * Handler for forgot password functionality.
 * - Finds the user by email
 * - Generates a plain reset token and stores its SHA-256 hash in PasswordResetToken table
 * - Emits a FORGOT_PASSWORD event (for email delivery via listeners)
 * - Returns the plain reset token in the response (for testing; remove in production)
 */
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    // --- Validate email ---
    if (!email || typeof email !== "string" || !email.trim()) {
      logger.warn("Missing email in forgot password request.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Email is required."));
    }

    // --- Find user ---
    const user = await findClient({ email: email.toLowerCase().trim() });

    if (!user) {
      logger.warn(`Forgot password attempt with unknown email: ${email}`);
      return next(new NotFoundError("No account found with that email address."));
    }

    // --- Generate OTP and hash ---
    const otp = generateNumericOTP(6);
    const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");
    const passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // --- Persist hashed OTP ---
    await persistPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(passwordResetExpires),
    });

    // --- Emit event (handled by listeners for email delivery) ---
    appEvents.emit(AppEventTypes.FORGOT_PASSWORD, {
      userId: user.id,
      email: user.email,
      otp, // Sending OTP instead of resetLink
      expiresIn: "10 minutes",
    });

    logger.info(`Password reset OTP generated for userId=${user.id} email=${user.email}`);

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password reset OTP sent to email.",
      // TODO: Remove OTP from response in production — rely on email delivery only
      otp,
    });
  } catch (error) {
    logger.error(`Error in forgot password handler: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
