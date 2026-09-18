import {
  Prisma,
  VERIFICATION_FREQUENCY,
  VerificationPlan,
} from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export interface CreateVerificationPlanData {
  verificationTypeId: string;
  frequency: VERIFICATION_FREQUENCY;
  name: string;
  description?: string | null;
  priceInCents: number;
  currency?: string;
}

export interface UpdateVerificationPlanData {
  verificationTypeId?: string;
  frequency?: VERIFICATION_FREQUENCY;
  name?: string;
  description?: string | null;
  priceInCents?: number;
  currency?: string;
}

export interface FindVerificationPlanUnique {
  id: string;
}

export type VerificationPlanCard = Pick<
  VerificationPlan,
  | "id"
  | "frequency"
  | "name"
  | "description"
  | "priceInCents"
  | "currency"
>;

export const getVerificationPlansForTypeSlug = async (
  verificationTypeSlug: string,
): Promise<VerificationPlanCard[]> => {
  try {
    const verificationPlans = await prismaClient.verificationPlan.findMany({
      where: {
        verificationType: { slug: verificationTypeSlug },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        frequency: true,
        name: true,
        description: true,
        priceInCents: true,
        currency: true,
      },
    });
    logger.info(
      `Fetched verification plans slug=${verificationTypeSlug} count=${verificationPlans.length}`,
    );
    return verificationPlans;
  } catch (error) {
    logger.error(
      `Error fetching verification plans slug=${verificationTypeSlug} ${error}`,
    );
    throw error;
  }
};

export const createVerificationPlan = async (
  data: CreateVerificationPlanData,
): Promise<VerificationPlan> => {
  try {
    const verificationPlan = await prismaClient.verificationPlan.create({
      data,
    });
    logger.info(
      `Verification plan created successfully verificationPlanId=${verificationPlan.id}`,
    );
    return verificationPlan;
  } catch (error) {
    logger.error(`Error creating verification plan ${error}`);
    throw error;
  }
};

export const getAllVerificationPlans = async (): Promise<
  VerificationPlan[]
> => {
  try {
    const verificationPlans = await prismaClient.verificationPlan.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(
      `Fetched all verification plans count=${verificationPlans.length}`,
    );
    return verificationPlans;
  } catch (error) {
    logger.error(`Error fetching verification plans ${error}`);
    throw error;
  }
};

export const findVerificationPlan = async (
  unique: FindVerificationPlanUnique,
): Promise<VerificationPlan | null> => {
  try {
    const verificationPlan = await prismaClient.verificationPlan.findUnique({
      where: unique,
    });
    logger.info(
      `Verification plan lookup verificationPlanId=${unique.id} found=${!!verificationPlan}`,
    );
    return verificationPlan;
  } catch (error) {
    logger.error(
      `Error finding verification plan ${error} verificationPlanId=${unique.id}`,
    );
    throw error;
  }
};

export const updateVerificationPlan = async (
  where: Prisma.VerificationPlanWhereUniqueInput,
  data: UpdateVerificationPlanData,
): Promise<VerificationPlan> => {
  try {
    const updated = await prismaClient.verificationPlan.update({ where, data });
    logger.info(
      `Verification plan updated successfully verificationPlanId=${updated.id}`,
    );
    return updated;
  } catch (error) {
    logger.error(`Error updating verification plan ${error}`);
    throw new Error("Failed to update verification plan");
  }
};

export const deleteVerificationPlan = async (
  where: Prisma.VerificationPlanWhereUniqueInput,
): Promise<VerificationPlan> => {
  try {
    const deleted = await prismaClient.verificationPlan.delete({ where });
    logger.info(
      `Verification plan deleted successfully verificationPlanId=${deleted.id}`,
    );
    return deleted;
  } catch (error) {
    logger.error(`Error deleting verification plan ${error}`);
    throw new Error("Failed to delete verification plan");
  }
};
