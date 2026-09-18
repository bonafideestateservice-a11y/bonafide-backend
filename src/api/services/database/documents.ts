import { Document, Prisma } from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";

export interface CreateDocumentData {
  verificationRequestId: string;
  url: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}

export interface UpdateDocumentData {
  verificationRequestId?: string;
  url?: string;
  fileName?: string;
  fileType?: string;
  fileSizeBytes?: number;
}

export interface FindDocumentUnique {
  id: string;
}

export const createDocument = async (
  data: CreateDocumentData,
): Promise<Document> => {
  try {
    const document = await prismaClient.document.create({ data });
    logger.info(
      `Document created successfully documentId=${document.id} verificationRequestId=${document.verificationRequestId}`,
    );
    return document;
  } catch (error) {
    logger.error(`Error creating document ${error}`);
    throw error;
  }
};

export const getAllDocuments = async (): Promise<Document[]> => {
  try {
    const documents = await prismaClient.document.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched all documents count=${documents.length}`);
    return documents;
  } catch (error) {
    logger.error(`Error fetching all documents ${error}`);
    throw error;
  }
};

export const getDocumentsByVerificationRequest = async (
  verificationRequestId: string,
): Promise<Document[]> => {
  try {
    const documents = await prismaClient.document.findMany({
      where: { verificationRequestId },
      orderBy: { createdAt: "desc" },
    });
    logger.info(
      `Fetched documents verificationRequestId=${verificationRequestId} count=${documents.length}`,
    );
    return documents;
  } catch (error) {
    logger.error(
      `Error fetching documents for verification request ${verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export const findDocument = async (
  unique: FindDocumentUnique,
): Promise<Document | null> => {
  try {
    const document = await prismaClient.document.findUnique({ where: unique });
    logger.info(`Document lookup documentId=${unique.id} found=${!!document}`);
    return document;
  } catch (error) {
    logger.error(`Error finding document documentId=${unique.id} ${error}`);
    throw error;
  }
};

export const updateDocument = async (
  where: Prisma.DocumentWhereUniqueInput,
  data: UpdateDocumentData,
): Promise<Document> => {
  try {
    const updated = await prismaClient.document.update({ where, data });
    logger.info(`Document updated successfully documentId=${updated.id}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating document ${error}`);
    throw new Error("Failed to update document");
  }
};

export const deleteDocument = async (
  where: Prisma.DocumentWhereUniqueInput,
): Promise<Document> => {
  try {
    const deleted = await prismaClient.document.delete({ where });
    logger.info(`Document deleted successfully documentId=${deleted.id}`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting document ${error}`);
    throw new Error("Failed to delete document");
  }
};
