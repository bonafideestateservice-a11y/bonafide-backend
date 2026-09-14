import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { HttpStatusCode, BadRequestError, InternalServerError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { findValidResetToken } from "../../../../services/database/password-reset-token";

export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { otp } = req.body;

    if (!otp) {
      logger.warn("OTP is required for verification.");
      return next(new BadRequestError("OTP is required."));
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(otp.trim())
      .digest("hex");

    const resetRecord = await findValidResetToken(tokenHash);

    if (!resetRecord) {
      logger.warn("Invalid or expired OTP.");
      return next(new BadRequestError("OTP is invalid or has expired."));
    }

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "OTP verified successfully.",
    });
  } catch (error) {
    logger.error(`Error in admin verify OTP handler: ${error}`);
    next(new InternalServerError("Internal server error."));
  }
};
