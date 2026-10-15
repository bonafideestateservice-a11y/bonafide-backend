import { MulterError } from "multer";
import request from "supertest";
import app from "../../app";
import { errorHandler } from "../../middlewares/error-handler";
import { BadRequestError } from "../../exceptions";
import { logger } from "../../utils/logger";
import { callHandler } from "../helpers/http";

jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), http: jest.fn() },
}));

const handle = async (error: Error) => {
  const { res } = await callHandler((req, response, next) =>
    errorHandler(error, req, response, next),
  );
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
};

describe("errorHandler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an ApiError's status and message, logged as a warning with the status", async () => {
    expect(await handle(new BadRequestError("rating is required."))).toEqual({
      status: 400,
      body: { status: "error", message: "rating is required." },
    });
    expect(logger.warn).toHaveBeenCalledWith("400 rating is required.");
  });

  it("returns 400 for an upload multer rejects", async () => {
    const result = await handle(new MulterError("LIMIT_UNEXPECTED_FILE", "photos"));
    expect(result.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("(field: photos)"));
  });

  it("returns 500 for anything else and logs the stack", async () => {
    const result = await handle(new Error("db down"));
    expect(result).toEqual({
      status: 500,
      body: { status: "error", message: "Internal server error" },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("500 Unhandled error: Error: db down"),
    );
  });

  it("returns 400, not 500, for a malformed JSON body", async () => {
    const response = await request(app)
      .post("/api/v1/client/login")
      .set("Content-Type", "application/json")
      .send('{ "email": "a@b.com", }');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ status: "error", message: "Request body is not valid JSON." });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("400 Request body is not valid JSON:"),
    );
  });
});
