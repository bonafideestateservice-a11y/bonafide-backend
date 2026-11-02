export const verificationReportChecklistLabels = [
  "Physical verification",
  "Court/crime verification",
  "Title deeds and documentation verification",
  "Valuation verification",
  "Amenities and environment verification",
] as const;

export type VerificationReportChecklistStatus = "PENDING" | "COMPLETE";

export const toVerificationReportChecklist = (
  items: {
    sortOrder: number;
    status: VerificationReportChecklistStatus;
  }[],
) =>
  verificationReportChecklistLabels.map((label, sortOrder) => ({
    label,
    status: items.find((item) => item.sortOrder === sortOrder)?.status ?? null,
  }));
