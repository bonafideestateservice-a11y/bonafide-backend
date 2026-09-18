import { Prisma } from "@prisma/client";

export interface VerificationRequestDetails {
  propertyName?: unknown;
  propertyType?: unknown;
  propertyAddress?: unknown;
  constructionAddress?: unknown;
  projectType?: unknown;
  currentConstructionStage?: unknown;
  businessName?: unknown;
  businessType?: unknown;
  businessAddress?: unknown;
}

export interface ValidatedVerificationDetails {
  details?: Prisma.InputJsonObject;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
  details: Record<string, unknown>,
  field: string,
): string | undefined => {
  const value = details[field];
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim();
};

export const validateVerificationDetails = (
  details: unknown,
  verificationTypeSlug: string,
  requireAllFields: boolean,
): ValidatedVerificationDetails => {
  if (!isRecord(details)) {
    return { error: "Details must be an object." };
  }

  const fields =
    verificationTypeSlug === "construction-progress"
      ? ["constructionAddress", "projectType", "currentConstructionStage"]
      : verificationTypeSlug === "business-verification"
        ? ["businessName", "businessType", "businessAddress"]
        : ["propertyType", "propertyAddress"];

  const normalized: Record<string, string> = {};
  for (const field of fields) {
    if (requireAllFields || details[field] !== undefined) {
      const value = requiredString(details, field);
      if (!value) {
        return {
          error: `${field} is required and must be a non-empty string.`,
        };
      }
      normalized[field] = value;
    }
  }

  if (
    verificationTypeSlug !== "construction-progress" &&
    verificationTypeSlug !== "business-verification"
  ) {
    if (details.propertyName !== undefined) {
      const value = requiredString(details, "propertyName");
      if (!value) {
        return { error: "propertyName must be a non-empty string." };
      }
      normalized.propertyName = value;
    }
  }

  return { details: normalized as Prisma.InputJsonObject };
};

export const isVerificationDetailsRecord = isRecord;
