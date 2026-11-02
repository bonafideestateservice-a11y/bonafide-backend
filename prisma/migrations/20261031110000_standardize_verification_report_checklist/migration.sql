-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('VERIFICATION_DOCUMENT', 'CHECKLIST_MEDIA', 'REPORT_DOCUMENT');

-- AlterTable
ALTER TABLE "Document"
ADD COLUMN "documentType" "DocumentType" NOT NULL DEFAULT 'VERIFICATION_DOCUMENT';

UPDATE "Document"
SET "documentType" = 'CHECKLIST_MEDIA'
WHERE "checklistItemId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Document_verificationReportId_documentType_idx"
ON "Document"("verificationReportId", "documentType");

-- Standardize the checklist templates used by new agent assignments.
UPDATE "ChecklistTemplateItem"
SET "label" = CASE "sortOrder"
    WHEN 0 THEN 'Physical verification'
    WHEN 1 THEN 'Court/crime verification'
    WHEN 2 THEN 'Title deeds and documentation verification'
    WHEN 3 THEN 'Valuation verification'
    WHEN 4 THEN 'Amenities and environment verification'
END
WHERE "sortOrder" BETWEEN 0 AND 4;

DELETE FROM "ChecklistTemplateItem" WHERE "sortOrder" > 4;

INSERT INTO "ChecklistTemplateItem" ("id", "verificationTypeId", "label", "requiresMedia", "sortOrder")
SELECT
    'report-checklist-template-' || verification_type."id" || '-' || item."sortOrder",
    verification_type."id",
    item."label",
    TRUE,
    item."sortOrder"
FROM "VerificationType" verification_type
CROSS JOIN (
    VALUES
        (0, 'Physical verification'),
        (1, 'Court/crime verification'),
        (2, 'Title deeds and documentation verification'),
        (3, 'Valuation verification'),
        (4, 'Amenities and environment verification')
) AS item("sortOrder", "label")
WHERE NOT EXISTS (
    SELECT 1
    FROM "ChecklistTemplateItem" existing
    WHERE existing."verificationTypeId" = verification_type."id"
      AND existing."sortOrder" = item."sortOrder"
);

-- Keep existing checklist progress and media while changing its displayed section labels.
UPDATE "VerificationChecklistItem"
SET "label" = CASE "sortOrder"
    WHEN 0 THEN 'Physical verification'
    WHEN 1 THEN 'Court/crime verification'
    WHEN 2 THEN 'Title deeds and documentation verification'
    WHEN 3 THEN 'Valuation verification'
    WHEN 4 THEN 'Amenities and environment verification'
END
WHERE "sortOrder" BETWEEN 0 AND 4;

-- Active assignments receive the remaining fixed checklist sections.
INSERT INTO "VerificationChecklistItem" ("id", "agentAssignmentId", "label", "status", "sortOrder", "createdAt", "updatedAt")
SELECT
    'report-checklist-item-' || assignment."id" || '-' || item."sortOrder",
    assignment."id",
    item."label",
    'PENDING',
    item."sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "AgentAssignment" assignment
CROSS JOIN (
    VALUES
        (0, 'Physical verification'),
        (1, 'Court/crime verification'),
        (2, 'Title deeds and documentation verification'),
        (3, 'Valuation verification'),
        (4, 'Amenities and environment verification')
) AS item("sortOrder", "label")
WHERE assignment."status" <> 'REPORT_SUBMITTED'
  AND NOT EXISTS (
    SELECT 1
    FROM "VerificationChecklistItem" existing
    WHERE existing."agentAssignmentId" = assignment."id"
      AND existing."sortOrder" = item."sortOrder"
);
