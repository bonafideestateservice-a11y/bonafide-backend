import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpStatusCode,
} from "../../../../../exceptions";
import { verifyGoogleIdToken } from "../../../../../libs/google/google";
import { generateToken } from "../../../../../utils/jwt";
import { logger } from "../../../../../utils/logger";
import { SUSPENDED_MESSAGE } from "../../../../../middlewares/check-jwt";
import { signInWithSocialProfile } from "../../services/social-auth";

/**
 * Google sign-in by token exchange: the frontend signs the user in with Google Identity
 * Services (web) or the Google Sign-In SDK (mobile) and posts the ID token here. We verify it
 * with Google and return our own JWT, in the same shape as /login.
 */

export const googleSignIn = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const idToken = req.body?.idToken;
    if (typeof idToken !== "string" || !idToken.trim()) {
      return next(new BadRequestError("idToken is required."));
    }

    const profile = await verifyGoogleIdToken(idToken.trim());
    const result = await signInWithSocialProfile(profile, {
      termsAndCondition: req.body?.termsAndCondition === true,
    });

    switch (result.kind) {
      case "EMAIL_REQUIRED":
        return next(
          new BadRequestError(
            "Your Google account didn't share an email address. Sign up with email instead.",
          ),
        );
      case "EMAIL_NOT_VERIFIED":
        return next(
          new ConflictError(
            "An account with this email already exists. Sign in with your password instead.",
          ),
        );
      case "NOT_A_CLIENT":
        return next(new ForbiddenError("This account can't sign in with Google."));
    }

    if (result.user.status === "SUSPENDED") return next(new ForbiddenError(SUSPENDED_MESSAGE));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...user } = result.user;
    res.status(HttpStatusCode.OK).json({
      message: "Login successful.",
      token: generateToken({ id: user.id }),
      user,
      isNewUser: result.created,
    });
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    logger.error(`Error during Google sign-in: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default googleSignIn;
