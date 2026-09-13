import { NextFunction, Request, Response } from "express";

import { CustomRequest } from "../../../../middlewares/check-jwt";
import { HttpStatusCode } from "../../../../exceptions";

export const getProfileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as CustomRequest).user;

    res.status(HttpStatusCode.OK).json({
      status: "ok",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};