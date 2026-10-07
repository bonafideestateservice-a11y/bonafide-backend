import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpStatusCode,
} from "../../../../../exceptions";
import { verifyFacebookAccessToken } from "../../../../../libs/facebook/facebook";
import { generateToken } from "../../../../../utils/jwt";
import { logger } from "../../../../../utils/logger";
import { SUSPENDED_MESSAGE } from "../../../../../middlewares/check-jwt";
import { signInWithSocialProfile } from "../../services/social-auth";

/**
 * Facebook sign-in by token exchange: the frontend signs the user in with the Facebook JS SDK
 * (web) or Facebook SDK (mobile) and posts the user access token here. We check it was issued
 * for our app, load the profile, and return our own JWT, in the same shape as /login.
 */
export const facebookSignIn = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const accessToken = req.body?.accessToken;
    if (typeof accessToken !== "string" || !accessToken.trim()) {
      return next(new BadRequestError("accessToken is required."));
    }

    const profile = await verifyFacebookAccessToken(accessToken.trim());
    const result = await signInWithSocialProfile(profile, {
      termsAndCondition: req.body?.termsAndCondition === true,
    });

    switch (result.kind) {
      case "EMAIL_REQUIRED":
        return next(
          new BadRequestError(
            "Your Facebook account didn't share an email address. Allow email access or sign up with email.",
          ),
        );
      case "EMAIL_NOT_VERIFIED":
        return next(
          new ConflictError(
            "An account with this email already exists. Sign in with your password instead.",
          ),
        );
      case "NOT_A_CLIENT":
        return next(new ForbiddenError("This account can't sign in with Facebook."));
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
    logger.error(`Error during Facebook sign-in: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default facebookSignIn;
