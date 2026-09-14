import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createPasswordResetToken } from "../../../../../utils/jwt";
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

    // --- Generate reset token and hash ---
    const { resetToken, passwordResetExpires } = createPasswordResetToken();
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // --- Persist hashed token ---
    await persistPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(passwordResetExpires),
    });

    // --- Build reset link ---
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // --- Emit event (handled by listeners for email delivery) ---
    appEvents.emit(AppEventTypes.FORGOT_PASSWORD, {
      userId: user.id,
      email: user.email,
      resetLink,
      expiresIn: "1 hour",
    });

    logger.info(`Password reset token generated for userId=${user.id} email=${user.email}`);

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password reset link sent to email.",
      // TODO: Remove token from response in production — rely on email delivery only
      token: resetToken,
    });
  } catch (error) {
    logger.error(`Error in forgot password handler: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
