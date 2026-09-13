import { NextFunction, Request, Response } from "express";

import { HttpStatusCode } from "../../../../exceptions";
import { findUserByEmail } from "../../services/database/user";
import { generateAccessToken, generateRefreshToken } from "../../../../utils/jwt";

export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        status: "error",
        message: "Email and password are required.",
      });
    }

    const user = await findUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(HttpStatusCode.UNAUTHORIZED).json({
        status: "error",
        message: "Invalid credentials.",
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(HttpStatusCode.OK).json({
      status: "ok",
      data: { accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};