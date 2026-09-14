import { Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { ROLE } from "@prisma/client";

import {
  createClient,
  findClient,
  updateClient,
} from "../../services/database/client";
import { logger } from "../../../../../utils/logger";
import { HttpStatusCode } from "../../../../../exceptions";
import { generateToken } from "../../../../../utils/jwt";

if (process.env.GOOGLE_CLIENT_ID) {
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      passReqToCallback: false,
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (err: unknown, user?: any) => void,
    ) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase().trim();
        const googleId = profile.id;

        if (!email) {
          logger.error(
            `No email found in Google profile: ${JSON.stringify(profile)}`,
          );
          return done(new Error("No email found in Google profile"));
        }

        let user = await findClient({ email });

        if (!user) {
          const firstName = profile.name?.givenName || "";
          const lastName = profile.name?.familyName || "";
          const middleName = (profile as any).name?.middleName || "";
          const fullName =
            [firstName, middleName, lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || email.split("@")[0];

          user = await createClient({
            fullName,
            email,
            password: null,
            provider: "google",
            providerId: googleId,
            role: ROLE.CLIENT,
          });
          logger.info(`New Google user created: ${email}`);
        } else if (!user.providerId || user.providerId !== googleId) {
          user = await updateClient(
            { id: user.id },
            {
              provider: "google",
              providerId: googleId,
            },
          );
          logger.info(`Linked existing user with Google: ${email}`);
        }

        return done(null, user);
      } catch (err) {
        logger.error(
          `Google OAuth error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return done(err);
      }
    },
  ),
);
}

passport.serializeUser((user: any, done) => {
  logger.info(`Serializing user for session: ${user?.id ?? "unknown"}`);
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  logger.info(`Deserializing user from session: ${user?.id ?? "unknown"}`);
  done(null, user);
});

export const initiateGoogleLogin = passport.authenticate("google", {
  scope: ["profile", "email"],
});

export const handleGoogleCallback = [
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/api/:version/client/auth/google/error",
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
      logger.info(
        `Google OAuth callback successful, JWT generated for userId=${user.id}`,
      );

      return res.status(HttpStatusCode.OK).json({
        status: "ok",
        data: { token },
      });
    } catch (err) {
      logger.error(
        `Failed to generate token after Google login: ${err instanceof Error ? err.message : String(err)}`,
      );
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
  logger.info(
    `Google login successful for userId=${userWithoutPassword?.id ?? "unknown"}`,
  );
  return res.status(HttpStatusCode.OK).json({ user: userWithoutPassword });
};

export const googleLoginError = (_req: Request, res: Response) => {
  logger.error("Error logging in via Google");
  return res.status(HttpStatusCode.UNAUTHORIZED).json({
    message: "Error logging in via Google",
  });
};

export const googleLogout = (req: Request, res: Response) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error(
            `Error destroying session during Google logout: ${err instanceof Error ? err.message : String(err)}`,
          );
          return res
            .status(HttpStatusCode.INTERNAL_SERVER)
            .json({ message: "Failed to destroy session" });
        }

        logger.info("Session destroyed during Google logout");
        return res
          .status(HttpStatusCode.OK)
          .json({ message: "Logged out successfully" });
      });
      return;
    }

    logger.warn("No session found during Google logout");
    return res
      .status(HttpStatusCode.OK)
      .json({ message: "No session found, but logged out" });
  } catch (err: any) {
    logger.error(
      `Failed to sign out user via Google: ${err instanceof Error ? err.message : String(err)}`,
    );
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ message: "Failed to sign out user" });
  }
};
