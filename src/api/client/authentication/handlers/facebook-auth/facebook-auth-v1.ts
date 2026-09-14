import { Request, Response } from "express";
import passport from "passport";
import { Strategy as FacebookStrategy, Profile } from "passport-facebook";
import { ROLE } from "@prisma/client";

import {
  createClient,
  findClient,
  updateClient,
} from "../../services/database/client";
import { logger } from "../../../../../utils/logger";
import { HttpStatusCode } from "../../../../../exceptions";

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_SECRET_KEY!,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL!,
      profileFields: ["id", "displayName", "emails", "name"],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (err: unknown, user?: any) => void,
    ) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase().trim();
        const facebookId = profile.id;

        if (!email) {
          logger.error(
            `No email found in Facebook profile: ${JSON.stringify(profile)}`,
          );
          return done(new Error("No email found in Facebook profile"));
        }

        let user = await findClient({ email });

        if (!user) {
          const firstName = (profile as any).name?.givenName || "";
          const lastName = (profile as any).name?.familyName || "";
          const fullName =
            [firstName, lastName].filter(Boolean).join(" ").trim() ||
            email.split("@")[0];

          user = await createClient({
            fullName,
            email,
            password: null,
            provider: "facebook",
            providerId: facebookId,
            role: ROLE.CLIENT,
          });
          logger.info(`New Facebook user created: ${email}`);
        } else if (!user.providerId || user.providerId !== facebookId) {
          user = await updateClient(
            { id: user.id },
            {
              provider: "facebook",
              providerId: facebookId,
            },
          );
          logger.info(`Linked existing user with Facebook: ${email}`);
        }

        return done(null, user);
      } catch (err) {
        logger.error(
          `Facebook OAuth error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  logger.info(
    `Serializing user for session (Facebook): ${user?.id ?? "unknown"}`,
  );
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  logger.info(
    `Deserializing user from session (Facebook): ${user?.id ?? "unknown"}`,
  );
  done(null, user);
});

export const initiateFacebookLogin = passport.authenticate("facebook", {
  scope: ["email"],
});

export const handleFacebookCallback = [
  passport.authenticate("facebook", {
    failureRedirect: "/api/:version/client/auth/facebook/error",
  }),
  (req: Request, res: Response) => {
    logger.info(
      `Facebook OAuth callback successful, redirecting to /auth/facebook/success for userId=${(req.user as any)?.id ?? "unknown"}`,
    );
    return res.redirect("/api/:version/client/auth/facebook/success");
  },
];

export const facebookLoginSuccess = (req: Request, res: Response) => {
  if (!req.user) {
    logger.warn(
      "Facebook login success endpoint hit but no user found in session",
    );
    return res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json({ message: "Not authenticated" });
  }

  const { password, ...userWithoutPassword } = req.user as any;
  logger.info(
    `Facebook login successful for userId=${userWithoutPassword?.id ?? "unknown"}`,
  );
  return res.status(HttpStatusCode.OK).json({ user: userWithoutPassword });
};

export const facebookLoginError = (_req: Request, res: Response) => {
  logger.error("Error logging in via Facebook");
  return res
    .status(HttpStatusCode.UNAUTHORIZED)
    .json({ message: "Error logging in via Facebook" });
};

export const facebookLogout = (req: Request, res: Response) => {
  try {
    req.logout((err) => {
      if (err) {
        logger.error(
          `Error during Facebook signout: ${err instanceof Error ? err.message : String(err)}`,
        );
        return res
          .status(HttpStatusCode.INTERNAL_SERVER)
          .json({ message: "Failed to sign out fb user" });
      }
      logger.info("Facebook user signed out");
      return res.status(HttpStatusCode.OK).json({ message: "Signed out" });
    });
  } catch (err) {
    logger.error(
      `Failed to sign out user via Facebook: ${err instanceof Error ? err.message : String(err)}`,
    );
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ message: "Failed to sign out user" });
  }
};

export const privacyPolicyHandler = (_req: Request, res: Response) => {
  res.status(200).json({ message: "Privacy Policy - OK" });
};

export const termsOfUseHandler = (_req: Request, res: Response) => {
  res.status(200).json({ message: "Terms of Use - OK" });
};
