import { NextFunction, Request, Response } from "express";
import { logger } from "../../utils/logger";
import { withRequestContext } from "../../utils/request-context";

describe("logger request tagging", () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const inRequest = (fn: () => void) =>
    withRequestContext(
      { method: "PATCH", originalUrl: "/api/v1/client/verification-requests/abc?x=1" } as Request,
      {} as Response,
      fn as NextFunction,
    );

  it("prefixes lines written during a request with its method and path", () => {
    inRequest(() => logger.warn("400 rating is required."));
    expect(warn.mock.calls[0][0]).toMatch(
      /\[WARN\] \[PATCH \/api\/v1\/client\/verification-requests\/abc\] 400 rating is required\.$/,
    );
  });

  it("doesn't prefix lines outside a request, or the request line itself", () => {
    logger.warn("ZEPTO_TOKEN is not configured");
    inRequest(() => logger.http("PATCH /x -> 200"));
    expect(warn.mock.calls[0][0]).toMatch(/\[WARN\] ZEPTO_TOKEN is not configured$/);
    expect(log.mock.calls[0][0]).toMatch(/\[HTTP\] PATCH \/x -> 200$/);
  });
});
