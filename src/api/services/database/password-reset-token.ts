import { PasswordResetToken, User } from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";
import type { Prisma } from "@prisma/client";

export interface CreatePasswordResetTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export type PasswordResetTokenWithUser = PasswordResetToken & {
  user: User;
};

export const createPasswordResetToken = async (
  data: CreatePasswordResetTokenData
): Promise<PasswordResetToken> => {
  try {
    const token = await prismaClient.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        used: false,
      },
    });
    logger.info(`Password reset token created id=${token.id} userId=${token.userId}`);
    return token;
  } catch (error) {
    logger.error(`Error creating password reset token ${error}`);
    throw error;
  }
};

export const findValidResetToken = async (
  tokenHash: string
): Promise<PasswordResetTokenWithUser | null> => {
  try {
    const token = await prismaClient.passwordResetToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
        used: false,
      },
      include: { user: true },
    });
    logger.info(`Password reset token lookup found=${!!token}`);
    return token;
  } catch (error) {
    logger.error(`Error finding password reset token ${error}`);
    throw error;
  }
};

export const getAllPasswordResetTokens = async (): Promise<PasswordResetToken[]> => {
  try {
    const tokens = await prismaClient.passwordResetToken.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched all password reset tokens count=${tokens.length}`);
    return tokens;
  } catch (error) {
    logger.error(`Error fetching all password reset tokens ${error}`);
    throw error;
  }
};

export const getPasswordResetTokensByUser = async (
  userId: string
): Promise<PasswordResetToken[]> => {
  try {
    const tokens = await prismaClient.passwordResetToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched password reset tokens userId=${userId} count=${tokens.length}`);
    return tokens;
  } catch (error) {
    logger.error(`Error fetching password reset tokens for user ${userId}: ${error}`);
    throw error;
  }
};

export const findPasswordResetTokenById = async (
  id: string
): Promise<PasswordResetToken | null> => {
  try {
    const token = await prismaClient.passwordResetToken.findUnique({ where: { id } });
    logger.info(`Password reset token lookup by id found=${!!token}`);
    return token;
  } catch (error) {
    logger.error(`Error finding password reset token by id ${error}`);
    throw error;
  }
};

export const markTokenAsUsed = async (
  id: string
): Promise<PasswordResetToken> => {
  try {
    const token = await prismaClient.passwordResetToken.update({
      where: { id },
      data: { used: true },
    });
    logger.info(`Password reset token marked as used id=${token.id}`);
    return token;
  } catch (error) {
    logger.error(`Error marking password reset token as used ${error}`);
    throw new Error("Failed to mark password reset token as used");
  }
};

export const deletePasswordResetToken = async (
  where: Prisma.PasswordResetTokenWhereUniqueInput
): Promise<PasswordResetToken> => {
  try {
    const deleted = await prismaClient.passwordResetToken.delete({ where });
    logger.info(`Password reset token deleted id=${deleted.id}`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting password reset token ${error}`);
    throw new Error("Failed to delete password reset token");
  }
};