import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config";
import { HttpStatusCode } from "../exceptions";

export interface AuthTokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface CustomRequest extends Request {
  token?: AuthTokenPayload;
  user?: Express.User;
}

export const checkJwt = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(HttpStatusCode.UNAUTHORIZED).json({
        status: "error",
        message: "Missing or malformed Authorization header.",
      });
    }

    const token = header.split(" ")[1];
    const payload = jwt.verify(token, config.jwt.secret) as AuthTokenPayload;

    (req as CustomRequest).token = payload;
    next();
  } catch {
    return res.status(HttpStatusCode.UNAUTHORIZED).json({
      status: "error",
      message: "Invalid or expired token.",
    });
  }
};