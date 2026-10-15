import { PropertyDocumentSource } from "@prisma/client";
import { BadRequestError } from "../../exceptions";
import { signedDocumentLinks, uploadPrivateDocument } from "../../libs/cloudinary/documents";
import {
  addPropertyRequestDocument,
  DocumentRow,
  listPropertyRequestDocuments,
} from "./database/property-request";

const MAX_NAME_LENGTH = 120;
const TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

/** A document with fresh signed links (they expire after 15 minutes, so fetch again to reopen). */
export const toDocumentResponse = (document: DocumentRow) => ({
  id: document.id,
  name: document.name,
  source: document.source,
  status: document.source === PropertyDocumentSource.BONAFIDE ? "Available" : "Submitted",
  fileName: document.fileName,
  fileType: TYPE_LABELS[document.fileType] ?? document.format.toUpperCase(),
  fileSizeBytes: document.fileSizeBytes,
  ...signedDocumentLinks(document),
  createdAt: document.createdAt.toISOString(),
});

/** "Available documents" (shared by Bonafide) and "Submitted documents" (the client's). */
export const getGroupedDocuments = async (requestId: string) => {
  const documents = (await listPropertyRequestDocuments(requestId)).map(toDocumentResponse);
  return {
    available: documents.filter((document) => document.source === PropertyDocumentSource.BONAFIDE),
    submitted: documents.filter((document) => document.source === PropertyDocumentSource.CLIENT),
  };
};

/**
 * Validates and stores an uploaded document privately. The name defaults to the file name
 * without its extension.
 */
export const saveDocument = async (
  requestId: string,
  source: PropertyDocumentSource,
  file: Express.Multer.File | undefined,
  name: unknown,
) => {
  if (!file) throw new BadRequestError("Attach the document in the file field.");
  if (name !== undefined && typeof name !== "string") {
    throw new BadRequestError("name must be a string.");
  }
  const displayName = (name?.trim() || file.originalname.replace(/\.[^.]+$/, "")).trim();
  if (!displayName) throw new BadRequestError("name is required.");
  if (displayName.length > MAX_NAME_LENGTH) {
    throw new BadRequestError(`name must be at most ${MAX_NAME_LENGTH} characters.`);
  }

  const stored = await uploadPrivateDocument(file);
  const document = await addPropertyRequestDocument({
    requestId,
    source,
    name: displayName,
    fileName: file.originalname,
    fileType: file.mimetype,
    fileSizeBytes: file.size,
    ...stored,
  });
  return toDocumentResponse(document);
};
