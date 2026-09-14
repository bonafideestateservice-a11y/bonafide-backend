import crypto from "crypto";

/**
 * Generates a cryptographically secure numeric OTP of the specified length.
 * @param length - The length of the OTP (default: 6)
 * @returns A numeric string (e.g., "739210")
 */
export const generateNumericOTP = (length: number = 6): string => {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
};
