import { Request, Response } from "express";
import passport from "passport";
import { Strategy as FacebookStrategy, Profile } from "passport-facebook";
import { createUser } from "../../services/database/user";
import { UserRole } from "@prisma/client";
import { logger } from "../../../../utils/logger";
import { HttpStatusCode } from "../../../../exceptions";

// Setup Facebook Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_SECRET_KEY!,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL!,
      profileFields: ["id", "displayName", "emails", "name"],
    },
    async (
      accessToken: any,
      refreshToken: any,
      profile: Profile,
      done: any,
    ) => {
      try {
        logger.info("Facebook OAuth callback triggered", {
          email: profile.emails?.[0]?.value,
        });
        // const email = profile.emails?.[0]?.value;
        const email =
          profile.emails?.[0]?.value || `${profile.id}@facebook.local`;
        if (!email) {
          logger.error("No email found in Facebook profile", { profile });
          return done(new Error("No email found in Facebook profile"));
        }
        const firstName = (profile as any).name?.givenName || "";
        const lastName = (profile as any).name?.familyName || "";
        const user = await createUser({
          firstName,
          middleName: "",
          lastName,
          email,
          password: "", // No password for Facebook users
          role: UserRole.CLIENT,
        });
        logger.info("User created or found via Facebook OAuth", { email });
        return done(null, user);
      } catch (err) {
        logger.error("Facebook OAuth error:", err);
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  logger.info("Serializing user for session (Facebook)", { userId: user?.id });
  done(null, user);
});
passport.deserializeUser((user: any, done) => {
  logger.info("Deserializing user from session (Facebook)", {
    userId: user?.id,
  });
  done(null, user);
});

export const initiateFacebookLogin = passport.authenticate("facebook", {
  scope: ["email"],
});

export const handleFacebookCallback = [
  passport.authenticate("facebook", {
    failureRedirect: "http://localhost:3000/api/:version/auth/facebook/error",
  }),
  (req: Request, res: Response) => {
    logger.info(
      "Facebook OAuth callback successful, redirecting to /auth/facebook/success",
      { userId: (req.user as any)?.id },
    );
    res.redirect("http://localhost:3000/api/:version/auth/facebook/success");
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
  logger.info("Facebook login successful", { userId: userWithoutPassword?.id });
  res.status(HttpStatusCode.OK).json({ user: userWithoutPassword });
};

export const facebookLoginError = (req: Request, res: Response) => {
  logger.error("Error logging in via Facebook");
  res
    .status(HttpStatusCode.UNAUTHORIZED)
    .json({ message: "Error logging in via Facebook" });
};

export const facebookLogout = (req: Request, res: Response) => {
  try {
    req.logout(function (err) {
      if (err) {
        logger.error("Error during Facebook signout:", err);
        return res
          .status(HttpStatusCode.INTERNAL_SERVER)
          .json({ message: "Failed to sign out fb user" });
      }
      logger.info("Facebook user signed out");
      res.status(HttpStatusCode.OK).json({ message: "Signed out" });
    });
  } catch (err) {
    logger.error("Failed to sign out user via Facebook", { error: err });
    res.status(400).send({ message: "Failed to sign out user" });
  }
};

export const privacyPolicyHandler = (req: Request, res: Response) => {
  res.status(200).json({ message: "Privacy Policy - OK" });
};

export const termsOfUseHandler = (req: Request, res: Response) => {
  res.status(200).json({ message: "Terms of Use - OK" });
};
