import { NextFunction, Request, Response } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../exceptions";
import { prismaClient } from "../utils/prisma";
import { extractTokenFromHeaders, verifyToken, AuthTokenPayload } from "../utils/jwt";
import type { User, ROLE } from "@prisma/client";

// CustomRequest interface to provide JWTs to controllers
export interface CustomRequest extends Request {
  token?: AuthTokenPayload;
  user?: User;
}

export const checkJwt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the JWT from the request header.
    const token = extractTokenFromHeaders(req);
    if (!token) {
      throw new UnauthorizedError("No token provided");
    }

    let payload: AuthTokenPayload;
    try {
      payload = await verifyToken(token);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedError("Token expired");
      }
      throw new UnauthorizedError("Invalid token");
    }

    // Check if the token has the required properties
    if (!payload.id) {
      throw new UnauthorizedError("Malformed token");
    }

    // Fetch the user from the database
    const user = await prismaClient.user.findUnique({
      where: {
        id: payload.id as string,
      },
    });

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // Explicitly cast req to CustomRequest and assign values
    (req as CustomRequest).user = user;
    (req as CustomRequest).token = payload;

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to handle role-based access for CLIENT, ADMIN, and AGENT
export const requireRole = (roles: ROLE[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as CustomRequest).user;

    if (!user) {
      return next(new UnauthorizedError("User not authenticated"));
    }

    if (!roles.includes(user.role)) {
      return next(new ForbiddenError("Insufficient permissions to access this resource"));
    }

    next();
  };
};
