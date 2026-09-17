import { Prisma, VerificationType } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export interface CreateVerificationTypeData {
  serviceId: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
}

export interface UpdateVerificationTypeData {
  serviceId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
}

export interface FindVerificationTypeUnique {
  id?: string;
  slug?: string;
}

export const createVerificationType = async (
  data: CreateVerificationTypeData,
): Promise<VerificationType> => {
  try {
    const verificationType = await prismaClient.verificationType.create({
      data,
    });
    logger.info(
      `Verification type created successfully verificationTypeId=${verificationType.id}`,
    );
    return verificationType;
  } catch (error) {
    logger.error(`Error creating verification type ${error}`);
    throw error;
  }
};

export const getAllVerificationTypes = async (): Promise<
  VerificationType[]
> => {
  try {
    const verificationTypes = await prismaClient.verificationType.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(
      `Fetched all verification types count=${verificationTypes.length}`,
    );
    return verificationTypes;
  } catch (error) {
    logger.error(`Error fetching verification types ${error}`);
    throw error;
  }
};

export const findVerificationType = async (
  unique: FindVerificationTypeUnique,
): Promise<VerificationType | null> => {
  try {
    const where: Prisma.VerificationTypeWhereUniqueInput = unique.id
      ? { id: unique.id }
      : { slug: unique.slug! };
    const verificationType = await prismaClient.verificationType.findUnique({
      where,
    });
    logger.info(
      `Verification type lookup criteria=${JSON.stringify(unique)} found=${!!verificationType}`,
    );
    return verificationType;
  } catch (error) {
    logger.error(
      `Error finding verification type ${error} criteria=${JSON.stringify(unique)}`,
    );
    throw error;
  }
};

export const updateVerificationType = async (
  where: Prisma.VerificationTypeWhereUniqueInput,
  data: UpdateVerificationTypeData,
): Promise<VerificationType> => {
  try {
    const updated = await prismaClient.verificationType.update({ where, data });
    logger.info(
      `Verification type updated successfully verificationTypeId=${updated.id}`,
    );
    return updated;
  } catch (error) {
    logger.error(`Error updating verification type ${error}`);
    throw new Error("Failed to update verification type");
  }
};

export const deleteVerificationType = async (
  where: Prisma.VerificationTypeWhereUniqueInput,
): Promise<VerificationType> => {
  try {
    const deleted = await prismaClient.verificationType.delete({ where });
    logger.info(
      `Verification type deleted successfully verificationTypeId=${deleted.id}`,
    );
    return deleted;
  } catch (error) {
    logger.error(`Error deleting verification type ${error}`);
    throw new Error("Failed to delete verification type");
  }
};
