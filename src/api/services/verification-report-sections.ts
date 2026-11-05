import { VerificationTierCode } from "@prisma/client";

export type VerificationReportSectionField = {
  key: string;
  label: string;
  type: "text" | "number";
};

export type VerificationReportSection = {
  key: string;
  label: string;
  requiresMedia: boolean;
  fields: VerificationReportSectionField[];
};

export type VerificationReportSectionResult = Record<string, string | number | boolean | null>;

const basicSections: VerificationReportSection[] = [
  {
    key: "site_visit",
    label: "Physical/site visit",
    requiresMedia: true,
    fields: [
      { key: "visitOutcome", label: "Visit outcome", type: "text" },
      { key: "notes", label: "Site observations", type: "text" },
    ],
  },
  {
    key: "local_enquiries",
    label: "Local enquiries",
    requiresMedia: false,
    fields: [
      { key: "outcome", label: "Enquiry outcome", type: "text" },
      { key: "notes", label: "Enquiry notes", type: "text" },
    ],
  },
];

const standardSections: VerificationReportSection[] = [
  {
    key: "land_registry_search",
    label: "Land-registry search",
    requiresMedia: true,
    fields: [
      { key: "outcome", label: "Search outcome", type: "text" },
      { key: "reference", label: "Search reference", type: "text" },
    ],
  },
  {
    key: "court_records_search",
    label: "Court-records search",
    requiresMedia: true,
    fields: [
      { key: "outcome", label: "Search outcome", type: "text" },
      { key: "reference", label: "Search reference", type: "text" },
    ],
  },
  {
    key: "local_intelligence",
    label: "Local intelligence",
    requiresMedia: true,
    fields: [{ key: "narrative", label: "Intelligence narrative", type: "text" }],
  },
];

const premiumSections: VerificationReportSection[] = [
  {
    key: "valuation",
    label: "Property valuation",
    requiresMedia: true,
    fields: [
      { key: "amount", label: "Valuation amount", type: "number" },
      { key: "currency", label: "Currency (ISO 4217)", type: "text" },
      { key: "basis", label: "Valuation basis", type: "text" },
      { key: "comparableEvidence", label: "Comparable evidence", type: "text" },
    ],
  },
  {
    key: "feasibility",
    label: "Intended-use feasibility",
    requiresMedia: true,
    fields: [
      { key: "outcome", label: "Feasibility outcome", type: "text" },
      { key: "assumptions", label: "Assumptions", type: "text" },
      { key: "constraints", label: "Constraints", type: "text" },
    ],
  },
];

const sectionsByTier: Record<VerificationTierCode, VerificationReportSection[]> = {
  [VerificationTierCode.BASIC]: basicSections,
  [VerificationTierCode.STANDARD]: [...basicSections, ...standardSections],
  [VerificationTierCode.PREMIUM]: [...basicSections, ...standardSections, ...premiumSections],
};

export const getVerificationReportSections = (
  tierCode: VerificationTierCode | null | undefined,
  siteVisitCount = 1,
): VerificationReportSection[] | null => {
  if (!tierCode) return null;

  const sections = sectionsByTier[tierCode];
  if (!Number.isSafeInteger(siteVisitCount) || siteVisitCount <= 1) return sections;

  const siteVisitSection = basicSections[0];
  const siteVisitSections = Array.from({ length: siteVisitCount }, (_, index) => {
    const visitNumber = index + 1;
    return {
      ...siteVisitSection,
      key: `site_visit_${visitNumber}`,
      label: `${siteVisitSection.label} ${visitNumber}`,
    };
  });

  return [...siteVisitSections, ...sections.slice(1)];
};

export const getSiteVisitNumberFromSectionKey = (sectionKey: string | null): number | null => {
  if (sectionKey === "site_visit") return 1;
  const match = /^site_visit_(\d+)$/.exec(sectionKey ?? "");
  if (!match) return null;

  const visitNumber = Number(match[1]);
  return Number.isSafeInteger(visitNumber) && visitNumber > 0 ? visitNumber : null;
};

export const parseVerificationReportSectionResult = (
  value: unknown,
): VerificationReportSectionResult | null => {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const entries = Object.entries(parsed);
  if (
    entries.some(
      ([, fieldValue]) =>
        fieldValue !== null &&
        typeof fieldValue !== "string" &&
        typeof fieldValue !== "number" &&
        typeof fieldValue !== "boolean",
    )
  ) {
    return null;
  }

  const result: VerificationReportSectionResult = {};
  for (const [key, fieldValue] of entries) {
    if (
      fieldValue === null ||
      typeof fieldValue === "string" ||
      typeof fieldValue === "number" ||
      typeof fieldValue === "boolean"
    ) {
      result[key] = fieldValue;
    }
  }
  return result;
};

export const getMissingVerificationReportFields = (
  section: VerificationReportSection,
  result: unknown,
): string[] => {
  const parsed = parseVerificationReportSectionResult(result);
  if (!parsed) return section.fields.map((field) => field.label);

  return section.fields.flatMap((field) => {
    const value = parsed[field.key];
    if (field.type === "number") {
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? [] : [field.label];
    }
    if (typeof value !== "string" || !value.trim()) return [field.label];
    if (field.key === "currency" && !/^[a-z]{3}$/i.test(value.trim())) {
      return [field.label];
    }
    return [];
  });
};

export const isVerificationReportSectionComplete = (
  section: VerificationReportSection,
  status: "PENDING" | "COMPLETE",
  result: unknown,
  mediaCount: number,
): boolean =>
  status === "COMPLETE" &&
  (!section.requiresMedia || mediaCount > 0) &&
  getMissingVerificationReportFields(section, result).length === 0;
