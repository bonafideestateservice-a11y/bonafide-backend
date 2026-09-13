import { NextFunction, Request, Response } from "express";

import { HttpStatusCode } from "../../../../exceptions";
import { createUser, findUserByEmail } from "../../services/database/user";

export const signUpHandler = async (
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

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        status: "error",
        message: "User already exists.",
      });
    }

    const user = await createUser({ email, password });

    res.status(HttpStatusCode.CREATED).json({
      status: "ok",
      data: { id: user.id, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};