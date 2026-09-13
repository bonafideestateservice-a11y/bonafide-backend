import { NextFunction, Request, Response } from "express";

import { HttpStatusCode } from "../../../../exceptions";
import { verifyRefreshToken, generateAccessToken } from "../../../../utils/jwt";

export const refreshTokenHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        status: "error",
        message: "Refresh token is required.",
      });
    }

    const payload = verifyRefreshToken(refreshToken);
    const accessToken = generateAccessToken(payload);

    res.status(HttpStatusCode.OK).json({
      status: "ok",
      data: { accessToken },
    });
  } catch (error) {
    next(error);
  }
};