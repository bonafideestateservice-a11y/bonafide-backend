import { NextFunction, Request, Response } from "express";

import { CustomRequest } from "./check-jwt";
import { HttpStatusCode } from "../exceptions";

export const checkIsAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = (req as CustomRequest).token;

  if (!token || token.role !== "ADMIN") {
    return res.status(HttpStatusCode.FORBIDDEN).json({
      status: "error",
      message: "Insufficient permissions.",
    });
  }

  next();
};

export const checkRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = (req as CustomRequest).token;

    if (!token || !roles.includes(token.role)) {
      return res.status(HttpStatusCode.FORBIDDEN).json({
        status: "error",
        message: "Insufficient permissions.",
      });
    }

    next();
  };
};