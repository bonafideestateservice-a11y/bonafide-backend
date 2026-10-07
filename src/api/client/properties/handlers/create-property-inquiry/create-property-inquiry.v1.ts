import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { createPropertyInquiry, isPropertyVisible } from "../../services/database/property";

const MAX_MESSAGE_LENGTH = 2000;

/** "Make Inquiry" on a published property. */
export const createPropertyInquiryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) throw new BadRequestError("message is required.");
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestError(`message must be at most ${MAX_MESSAGE_LENGTH} characters.`);
    }
    if (!(await isPropertyVisible(req.params.id))) throw new NotFoundError("Property not found.");
    const userId = (req as CustomRequest).user?.id as string;
    const inquiry = await createPropertyInquiry(req.params.id, userId, message);
    res.status(HttpStatusCode.CREATED).json({
      id: inquiry.id,
      propertyId: inquiry.propertyId,
      message: inquiry.message,
      createdAt: inquiry.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    logger.error(`Error creating property inquiry: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
