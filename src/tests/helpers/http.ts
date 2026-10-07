import { NextFunction, Request, Response } from "express";

/** Calls an Express handler with a fake request and returns the mocked response and next. */
export const callHandler = async (
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Record<string, unknown> = {},
) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
  const next = jest.fn() as jest.Mock & NextFunction;
  await handler({ query: {}, params: {}, body: {}, ...req } as unknown as Request, res, next);
  return { res, next };
};

export const errorStatus = (next: jest.Mock) => next.mock.calls[0]?.[0]?.statusCode;
