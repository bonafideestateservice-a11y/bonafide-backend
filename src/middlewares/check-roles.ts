import { NextFunction, Request, Response } from "express";

import { CustomRequest } from "./check-jwt";
import { ForbiddenError, UnauthorizedError } from "../exceptions";
import { ROLE } from "@prisma/client";

export const checkIsAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as CustomRequest).user;

  if (!user) {
    return next(new UnauthorizedError("User not authenticated"));
  }

  if (user.role !== ROLE.ADMIN) {
    return next(new ForbiddenError("Insufficient permissions. Admin access required."));
  }

  next();
};

export const checkRoles = (roles: ROLE[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as CustomRequest).user;

    if (!user) {
      return next(new UnauthorizedError("User not authenticated"));
    }

    if (!roles.includes(user.role)) {
      return next(new ForbiddenError("Insufficient permissions."));
    }

    next();
  };
};