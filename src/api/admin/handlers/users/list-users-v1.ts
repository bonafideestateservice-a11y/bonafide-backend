import { NextFunction, Request, Response } from "express";

import { HttpStatusCode } from "../../../../exceptions";

export const listUsersHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.status(HttpStatusCode.OK).json({
      status: "ok",
      data: [],
    });
  } catch (error) {
    next(error);
  }
};