import { Prisma, VerificationReport } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export interface CreateVerificationReportData {
  verificationRequestId: string;
  submittedByAgentId: string;
  summary?: string | null;
  findings?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  reportUrl?: string | null;
  generatedAt?: Date | null;
}

export interface UpdateVerificationReportData {
  verificationRequestId?: string;
  summary?: string | null;
  findings?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  reportUrl?: string | null;
  generatedAt?: Date | null;
}

export interface FindVerificationReportUnique {
  id?: string;
  verificationRequestId?: string;
}

export const countUnviewedVerificationReports = async (userId: string): Promise<number> => {
  try {
    const count = await prismaClient.verificationReport.count({
      where: {
        viewedAt: null,
        verificationRequest: { userId },
      },
    });
    logger.info(`Counted unviewed verification reports userId=${userId} count=${count}`);
    return count;
  } catch (error) {
    logger.error(`Error counting unviewed verification reports ${error}`);
    throw error;
  }
};

export const createVerificationReport = async (
  data: CreateVerificationReportData,
): Promise<VerificationReport> => {
  try {
    const verificationReport = await prismaClient.verificationReport.create({
      data,
    });
    logger.info(`Verification report created successfully reportId=${verificationReport.id}`);
    return verificationReport;
  } catch (error) {
    logger.error(`Error creating verification report ${error}`);
    throw error;
  }
};

export const getAllVerificationReports = async (): Promise<VerificationReport[]> => {
  try {
    const verificationReports = await prismaClient.verificationReport.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched all verification reports count=${verificationReports.length}`);
    return verificationReports;
  } catch (error) {
    logger.error(`Error fetching verification reports ${error}`);
    throw error;
  }
};

export const findVerificationReport = async (
  unique: FindVerificationReportUnique,
): Promise<VerificationReport | null> => {
  try {
    const where: Prisma.VerificationReportWhereUniqueInput = unique.id
      ? { id: unique.id }
      : { verificationRequestId: unique.verificationRequestId! };
    const verificationReport = await prismaClient.verificationReport.findUnique({
      where,
    });
    logger.info(
      `Verification report lookup criteria=${JSON.stringify(unique)} found=${!!verificationReport}`,
    );
    return verificationReport;
  } catch (error) {
    logger.error(`Error finding verification report ${error} criteria=${JSON.stringify(unique)}`);
    throw error;
  }
};

export const updateVerificationReport = async (
  where: Prisma.VerificationReportWhereUniqueInput,
  data: UpdateVerificationReportData,
): Promise<VerificationReport> => {
  try {
    const { verificationRequestId, ...updateData } = data;
    const updated = await prismaClient.verificationReport.update({
      where,
      data: {
        ...updateData,
        ...(verificationRequestId
          ? { verificationRequest: { connect: { id: verificationRequestId } } }
          : {}),
      },
    });
    logger.info(`Verification report updated successfully reportId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating verification report ${error}`);
    throw new Error("Failed to update verification report");
  }
};

export const deleteVerificationReport = async (
  where: Prisma.VerificationReportWhereUniqueInput,
): Promise<VerificationReport> => {
  try {
    const deleted = await prismaClient.verificationReport.delete({ where });
    logger.info(`Verification report deleted successfully reportId=${deleted.id}`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting verification report ${error}`);
    throw new Error("Failed to delete verification report");
  }
};
