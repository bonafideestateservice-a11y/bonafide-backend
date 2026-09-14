import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  HttpStatusCode,
  BadRequestError,
  InternalServerError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { findValidResetToken, markTokenAsUsed } from "../../../../services/database/password-reset-token";
import { updateAdmin } from "../../services/database/admin";

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      logger.warn("Token and password are required for admin password reset.");
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

    const hashedPassword = await bcrypt.hash(password, 12);

    await updateAdmin({ id: resetRecord.userId }, { password: hashedPassword });
    logger.info(`Password reset successful for admin: ${resetRecord.userId}`);

    await markTokenAsUsed(resetRecord.id);

    return res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    logger.error(`Error in admin reset password handler: ${error}`);
    next(new InternalServerError("Internal server error"));
  }
};
