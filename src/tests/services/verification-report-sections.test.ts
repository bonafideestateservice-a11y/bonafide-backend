import { VerificationTierCode } from "@prisma/client";
import {
  getSiteVisitNumberFromSectionKey,
  getMissingVerificationReportFields,
  getVerificationReportSections,
  isVerificationReportSectionComplete,
  parseVerificationReportSectionResult,
} from "../../api/services/verification-report-sections";
import { toClientVerificationReportView } from "../../api/services/client-verification-report";

describe("tier-specific verification report sections", () => {
  it.each([
    [VerificationTierCode.BASIC, 2],
    [VerificationTierCode.STANDARD, 5],
    [VerificationTierCode.PREMIUM, 7],
  ] as const)("returns the %s section set", (tierCode, expectedCount) => {
    expect(getVerificationReportSections(tierCode)).toHaveLength(expectedCount);
  });

  it("keeps the legacy checklist path when no tier is selected", () => {
    expect(getVerificationReportSections(null)).toBeNull();
  });

  it.each([
    [1, ["site_visit", "local_enquiries"]],
    [2, ["site_visit_1", "site_visit_2", "local_enquiries"]],
    [3, ["site_visit_1", "site_visit_2", "site_visit_3", "local_enquiries"]],
  ])("creates %i site-visit checklist section(s)", (count, expectedKeys) => {
    expect(
      getVerificationReportSections(VerificationTierCode.BASIC, count)?.map(
        (section) => section.key,
      ),
    ).toEqual(expectedKeys);
  });

  it.each([
    ["site_visit", 1],
    ["site_visit_1", 1],
    ["site_visit_3", 3],
    ["local_enquiries", null],
    ["site_visit_0", null],
  ] as const)("maps section %s to visit number %s", (key, visitNumber) => {
    expect(getSiteVisitNumberFromSectionKey(key)).toBe(visitNumber);
  });

  it("returns numbered site visit findings in visit order", () => {
    const report = toClientVerificationReportView({
      findings: {
        sections: [
          { key: "site_visit_2", result: { visitOutcome: "Found", notes: "Second" } },
          { key: "site_visit_1", result: { visitOutcome: "Found", notes: "First" } },
        ],
      },
    });

    expect(report.findings).toEqual({
      physicalVisits: [
        { visitNumber: 1, outcome: "Found", notes: "First" },
        { visitNumber: 2, outcome: "Found", notes: "Second" },
      ],
    });
  });

  it("parses flat JSON results and rejects malformed or nested values", () => {
    expect(parseVerificationReportSectionResult('{"outcome":"Clear","count":1}')).toEqual({
      outcome: "Clear",
      count: 1,
    });
    expect(parseVerificationReportSectionResult("{")).toBeNull();
    expect(parseVerificationReportSectionResult('{"nested":{"value":"x"}}')).toBeNull();
  });

  it("requires non-empty text and positive numeric valuation amounts", () => {
    const premiumSections = getVerificationReportSections(VerificationTierCode.PREMIUM)!;
    const valuation = premiumSections.find((section) => section.key === "valuation")!;

    expect(getMissingVerificationReportFields(valuation, {})).toEqual([
      "Valuation amount",
      "Currency (ISO 4217)",
      "Valuation basis",
      "Comparable evidence",
    ]);
    expect(
      getMissingVerificationReportFields(valuation, {
        amount: 0,
        currency: "US",
        basis: "Market comparison",
        comparableEvidence: "Nearby sales",
      }),
    ).toEqual(["Valuation amount", "Currency (ISO 4217)"]);
    expect(
      getMissingVerificationReportFields(valuation, {
        amount: 120000,
        currency: "USD",
        basis: "Market comparison",
        comparableEvidence: "Nearby sales",
      }),
    ).toEqual([]);
  });

  it("counts a section complete only when its required fields and uploads are present", () => {
    const siteVisit = getVerificationReportSections(VerificationTierCode.BASIC)![0];
    const result = { visitOutcome: "Accessible", notes: "Exterior inspected." };

    expect(isVerificationReportSectionComplete(siteVisit, "COMPLETE", result, 0)).toBe(false);
    expect(isVerificationReportSectionComplete(siteVisit, "PENDING", result, 1)).toBe(false);
    expect(isVerificationReportSectionComplete(siteVisit, "COMPLETE", {}, 1)).toBe(false);
    expect(isVerificationReportSectionComplete(siteVisit, "COMPLETE", result, 1)).toBe(true);
  });
});
