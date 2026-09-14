import express, { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { createUser, findUser, updateUser } from "../../services/database/user";
import { logger } from "../../../../utils/logger";
import { HttpStatusCode } from "../../../../exceptions";
import { generateToken } from "../../../../utils/jwt";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;

        if (!email) {
          logger.error("No email found in Google profile", { profile });
          return done(new Error("No email found in Google profile"));
        }

        // Look for existing user by providerId (preferred) or fallback to email
        let user = await findUser({
          providerId: googleId,
        });
        if (!user) {
          user = await findUser({ email });
        }

        // If user does not exist, create a new one
        if (!user) {
          const firstName = (profile as any).name?.givenName || "";
          const lastName = (profile as any).name?.familyName || "";
          const middleName = (profile as any).name?.middleName || "";
          user = await createUser({
            firstName,
            middleName,
            lastName,
            email,
            password: "", // No password needed for Google users
            provider: "google",
            providerId: googleId,
            emailVerified: true,
            // Optionally add role if required, e.g. role: UserRole.CLIENT,
          });
          logger.info("New Google user created", { email });
        } else if (!user.providerId) {
          // Link existing local account to Google (optional)
          user = await updateUser(
            { id: user.id },
            {
              provider: "google",
              providerId: googleId,
            },
          );
          logger.info("Linked existing user with Google", { email });
        }

        return done(null, user);
      } catch (err) {
        logger.error("Google OAuth error", { err });
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  logger.info("Serializing user for session", { userId: user?.id });
  done(null, user);
});
passport.deserializeUser((user: any, done) => {
  logger.info("Deserializing user from session", { userId: user?.id });
  done(null, user);
});

export const initiateGoogleLogin = passport.authenticate("google", {
  scope: ["profile", "email"],
});

export const handleGoogleCallback = [
  passport.authenticate("google", {
    session: false,
    failureRedirect:
      "https://ajsrental-ajarra-backend.onrender.com/api/:version/auth/google/error",
  }),
  async (req: Request, res: Response) => {
    const user = req.user as any;

    if (!user) {
      logger.warn("Google callback: No user found in session");
      return res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json({ message: "Authentication failed" });
    }

    try {
      const token = generateToken({ id: user.id });

      logger.info("Google OAuth callback successful, JWT generated", {
        userId: user.id,
      });

      return res.status(HttpStatusCode.OK).json({
        status: "ok",
        data: { token },
      });

      // Optional: redirect and pass token in query
      // res.redirect(`https://your-frontend.com/google/success?token=${token}`);
    } catch (err) {
      logger.error("Failed to generate token after Google login", {
        error: err,
      });
      return res
        .status(HttpStatusCode.INTERNAL_SERVER)
        .json({ message: "Token generation failed" });
    }
  },
];

export const googleLoginSuccess = (req: Request, res: Response) => {
  if (!req.user) {
    logger.warn(
      "Google login success endpoint hit but no user found in session",
    );
    return res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json({ message: "Not authenticated" });
  }
  const { password, ...userWithoutPassword } = req.user as any;
  logger.info("Google login successful", { userId: userWithoutPassword?.id });
  res.status(HttpStatusCode.OK).json({ user: userWithoutPassword });
};

export const googleLoginError = (req: Request, res: Response) => {
  logger.error("Error logging in via Google");
  res.send("Error logging in via Google..");
};

export const googleLogout = (req: Request, res: Response) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error("Error destroying session during Google logout", {
            error: err,
          });
          return res.status(500).send({ message: "Failed to destroy session" });
        } else {
          logger.info("Session destroyed during Google logout");
          return res.status(200).json({ message: "Logged out successfully" });
        }
      });
    } else {
      logger.warn("No session found during Google logout");
      return res
        .status(200)
        .json({ message: "No session found, but logged out" });
    }
  } catch (err: any) {
    logger.error("Failed to sign out user via Google", {
      error: err?.message || err,
    });
    res.status(400).send({ message: "Failed to sign out user" });
  }
};
