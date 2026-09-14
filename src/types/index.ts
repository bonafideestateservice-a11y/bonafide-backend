/* eslint-disable @typescript-eslint/no-namespace */
import { Request } from "express";
import { AuthTokenPayload } from "../utils/jwt";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
    }
  }
}

export { AuthTokenPayload };
export type TypedRequest<TBody = Record<string, unknown>> = Request<unknown, unknown, TBody>;