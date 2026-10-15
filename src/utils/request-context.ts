import { AsyncLocalStorage } from "async_hooks";
import { NextFunction, Request, Response } from "express";

/** The request a log line was written during, e.g. "PATCH /api/v1/client/verification-requests/abc". */
const requestContext = new AsyncLocalStorage<string>();

export const currentRequest = () => requestContext.getStore();

/** Tags every log line written while handling the request with its method and path. */
export const withRequestContext = (req: Request, _res: Response, next: NextFunction) =>
  requestContext.run(`${req.method} ${req.originalUrl.split("?")[0]}`, next);
