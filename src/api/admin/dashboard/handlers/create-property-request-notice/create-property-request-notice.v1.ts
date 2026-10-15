import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  addPropertyRequestNotice,
  toAdminRequestResponse,
} from "../../../../services/database/property-request";

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1000;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** A "Purchase notice" card: a titled message for the client, without a status change. */
export const createPropertyRequestNoticeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const title = text(req.body?.title);
  const message = text(req.body?.message);
  if (!title || !message) return next(new BadRequestError("title and message are required."));
  if (title.length > MAX_TITLE_LENGTH) {
    return next(new BadRequestError(`title must be at most ${MAX_TITLE_LENGTH} characters.`));
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return next(new BadRequestError(`message must be at most ${MAX_MESSAGE_LENGTH} characters.`));
  }
  try {
    const request = await addPropertyRequestNotice(req.params.id, title, message);
    if (!request) return next(new NotFoundError("Property request not found."));
    res.status(HttpStatusCode.CREATED).json(toAdminRequestResponse(request));
  } catch (error) {
    logger.error(`Error adding purchase notice: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
