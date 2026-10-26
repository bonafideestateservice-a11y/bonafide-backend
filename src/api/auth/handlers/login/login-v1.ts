import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  UnauthorizedError,
} from "../../../../exceptions";
import { SUSPENDED_MESSAGE } from "../../../../middlewares/check-jwt";
import { generateToken } from "../../../../utils/jwt";
import { logger } from "../../../../utils/logger";
import { verifyPassword } from "../../../../utils/password";
import { findUserByEmail } from "../../../services/database/user";

const INVALID_CREDENTIALS = "Invalid email or password.";

/**
 * One login for every role. The frontend routes on `user.role` (CLIENT, ADMIN or AGENT).
 * Unknown emails and wrong passwords get the same 401 so emails can't be probed.
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || !email.trim()) {
    return next(new BadRequestError("Email is required."));
  }
  if (typeof password !== "string" || !password) {
    return next(new BadRequestError("Password is required."));
  }

  try {
    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      logger.warn("Login attempt with unknown email.");
      return next(new UnauthorizedError(INVALID_CREDENTIALS));
    }
    if (!user.password) {
      return next(
        new UnauthorizedError("This account uses social login. Please use Google or Facebook."),
      );
    }
    if (!(await verifyPassword(password, user.password))) {
      logger.warn(`Invalid password attempt userId=${user.id}`);
      return next(new UnauthorizedError(INVALID_CREDENTIALS));
    }
    if (user.status === "SUSPENDED") return next(new ForbiddenError(SUSPENDED_MESSAGE));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    logger.info(`User logged in userId=${user.id} role=${user.role}`);
    res.status(HttpStatusCode.OK).json({
      message: "Login successful.",
      token: generateToken({ id: user.id }),
      user: userWithoutPassword,
    });
  } catch (error) {
    logger.error(`Error during login: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
