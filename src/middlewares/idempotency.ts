import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { BadRequestError, ConflictError } from "../exceptions";
import { prismaClient } from "../utils/prisma";
import { logger } from "../utils/logger";
import { CustomRequest } from "./check-jwt";

const MAX_KEY_LENGTH = 255;

/**
 * Optional `Idempotency-Key` header support, after checkJwt. The first request with a key runs
 * normally and its response is saved; repeating the key on the same route returns that saved
 * response instead of running again (so a retried "Confirm payment" can't start a second
 * checkout). A repeat while the first is still running gets 409. Server errors (5xx) aren't
 * saved, so the client can retry with the same key.
*/

export const idempotent = async (req: Request, res: Response, next: NextFunction) => {
  const key = req.header("Idempotency-Key")?.trim();
  if (!key) return next();
  if (key.length > MAX_KEY_LENGTH) {
    return next(
      new BadRequestError(`Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters.`),
    );
  }

  const scope = {
    userId: (req as CustomRequest).user?.id ?? "anonymous",
    route: `${req.method} ${req.originalUrl.split("?")[0]}`,
    key,
  };
  try {
    await prismaClient.idempotencyKey.create({ data: scope });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return next(error);
    }
    const saved = await prismaClient.idempotencyKey.findUnique({
      where: { userId_route_key: scope },
    });
    if (saved?.statusCode == null) {
      return next(
        new ConflictError("A request with this Idempotency-Key is still being processed."),
      );
    }
    res.setHeader("Idempotent-Replayed", "true");
    return res.status(saved.statusCode).json(saved.body);
  }

  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    const where = { userId_route_key: scope };
    const save =
      res.statusCode >= 500
        ? prismaClient.idempotencyKey.delete({ where })
        : prismaClient.idempotencyKey.update({
            where,
            data: { statusCode: res.statusCode, body: (body ?? null) as Prisma.InputJsonValue },
          });
    save.catch((error) => logger.error(`Could not save Idempotency-Key response: ${error}`));
    return json(body);
  };
  return next();
};
