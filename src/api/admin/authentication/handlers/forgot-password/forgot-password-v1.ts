import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createPasswordResetToken } from "../../../../../utils/jwt";
import { HttpStatusCode, NotFoundError, ApiError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { appEvents, AppEventTypes } from "../../../../../events";
import { findAdmin } from "../../services/database/admin";
import { createPasswordResetToken as persistPasswordResetToken } from "../../../../services/database/password-reset-token";

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    // --- Validate email ---
    if (!email || typeof email !== "string" || !email.trim()) {
      logger.warn("Missing email in admin forgot password request.");
      return next(new ApiError(HttpStatusCode.BAD_REQUEST, "Email is required."));
    }

    // --- Find admin ---
    const admin = await findAdmin({ email: email.toLowerCase().trim() });

    if (!admin) {
      logger.warn(`Admin forgot password attempt with unknown email: ${email}`);
      return next(new NotFoundError("No account found with that email address."));
    }

    // --- Generate reset token and hash ---
    const { resetToken, passwordResetExpires } = createPasswordResetToken();
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // --- Persist hashed token ---
    await persistPasswordResetToken({
      userId: admin.id,
      tokenHash,
      expiresAt: new Date(passwordResetExpires),
    });

    // --- Build reset link ---
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // --- Emit event (handled by listeners for email delivery) ---
    appEvents.emit(AppEventTypes.FORGOT_PASSWORD, {
      userId: admin.id,
      email: admin.email,
      resetLink,
      expiresIn: "1 hour",
    });

    logger.info(`Password reset token generated for adminId=${admin.id} email=${admin.email}`);

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password reset link sent to email.",
      token: resetToken,
    });
  } catch (error) {
    logger.error(`Error in admin forgot password handler: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
