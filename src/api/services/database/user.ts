import { User } from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";

/** Any user (client, admin or agent) by email; pass the email already trimmed and lower-cased. */
export const findUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const user = await prismaClient.user.findUnique({ where: { email } });
    logger.info(`User lookup by email found=${!!user}`);
    return user;
  } catch (error) {
    logger.error(`Error finding user by email ${error}`);
    throw error;
  }
};
