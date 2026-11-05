import {
  VerificationReportChecklistStatus,
  toVerificationReportChecklist,
} from "./verification-report-checklist";

type JsonRecord = Record<string, unknown>;

export type ClientReportChecklistItem = {
  label: string;
  status: VerificationReportChecklistStatus;
  sortOrder: number;
  sectionKey?: string | null;
  result?: unknown;
  media?: { url: string; fileName?: string | null }[];
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const firstRecord = (...values: unknown[]): JsonRecord | null => {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
};

const getSnapshotRecord = (snapshot: unknown, key: string): JsonRecord | null =>
  isRecord(snapshot) ? firstRecord(snapshot[key]) : null;

const getFindingsRecord = (findings: unknown, key: string): JsonRecord | null =>
  isRecord(findings) ? firstRecord(findings[key]) : null;

const toIsoDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toNonNegativeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const publicFindingKeys: Record<string, string> = {
  site_visit: "physicalVisit",
  local_enquiries: "localEnquiries",
  land_registry_search: "landRegistry",
  court_records_search: "courtRecords",
  local_intelligence: "localIntelligence",
};

const toClientFindings = (findings: unknown): unknown => {
  if (!isRecord(findings) || !Array.isArray(findings.sections)) return findings ?? null;

  const result: JsonRecord = {};
  const physicalVisits: JsonRecord[] = [];
  for (const section of findings.sections) {
    if (!isRecord(section) || typeof section.key !== "string" || !isRecord(section.result)) {
      continue;
    }

    const sectionResult = { ...section.result };
    if (
      (section.key === "site_visit" || /^site_visit_\d+$/.test(section.key)) &&
      typeof sectionResult.visitOutcome === "string" &&
      sectionResult.outcome === undefined
    ) {
      sectionResult.outcome = sectionResult.visitOutcome;
      delete sectionResult.visitOutcome;
    }

    const visitMatch = /^site_visit_(\d+)$/.exec(section.key);
    if (visitMatch) {
      physicalVisits.push({ visitNumber: Number(visitMatch[1]), ...sectionResult });
    } else {
      const publicKey = publicFindingKeys[section.key] ?? section.key;
      result[publicKey] = sectionResult;
    }
  }
  if (physicalVisits.length > 0) {
    result.physicalVisits = physicalVisits.sort(
      (left, right) => Number(left.visitNumber) - Number(right.visitNumber),
    );
  }
  return result;
};

export const toClientVerificationReportView = (report: {
  findings: unknown;
  packageScopeSnapshot?: unknown;
  tierNameSnapshot?: string | null;
}) => {
  const snapshotTier = getSnapshotRecord(report.packageScopeSnapshot, "tier");
  const findingsTier = getFindingsRecord(report.findings, "tier");
  const tier = snapshotTier ?? findingsTier;
  const tierCode = tier && typeof tier.code === "string" ? tier.code : null;
  const tierName =
    report.tierNameSnapshot ?? (tier && typeof tier.name === "string" ? tier.name : null);

  const snapshotPeriod = getSnapshotRecord(report.packageScopeSnapshot, "period");
  const findingsPeriod = getFindingsRecord(report.findings, "period");
  const period = snapshotPeriod ?? findingsPeriod;

  return {
    verificationTier: tierCode || tierName ? { code: tierCode, name: tierName } : null,
    subscriptionPeriod: period
      ? {
          startsAt: toIsoDate(period.periodStart ?? period.startsAt),
          endsAt: toIsoDate(period.periodEnd ?? period.endsAt),
          checksIncluded: toNonNegativeNumber(period.requiredSiteVisits ?? period.checksIncluded),
          checksCompleted: toNonNegativeNumber(
            period.completedSiteVisits ?? period.checksCompleted,
          ),
        }
      : null,
    findings: toClientFindings(report.findings),
  };
};

export const toClientReportChecklist = (items: ClientReportChecklistItem[]) => {
  if (!items.some((item) => item.sectionKey)) return toVerificationReportChecklist(items);

  return items.map((item) => ({
    label: item.label,
    status: item.status,
    ...(item.sectionKey
      ? {
          sectionKey: item.sectionKey,
          result: item.result ?? null,
          media: (item.media ?? []).map(({ url, fileName }) => ({
            url,
            fileName: fileName ?? null,
          })),
        }
      : {}),
  }));
};

export const toClientReportDocument = <
  T extends { fileType: string; id: string; url: string; fileName: string; fileSizeBytes: number },
>(
  document: T | undefined,
) => (document ? { ...document, contentType: document.fileType } : null);
