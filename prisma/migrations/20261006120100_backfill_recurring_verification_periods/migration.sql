-- Backfill for recurring verification periods.
-- Runs after 20261006120000_recurring_verification_periods, so AWAITING_RENEWAL is committed.
-- Before this change a request had at most one report, so every step below touches at most
-- one report per request.

-- "Paid period without a report": a successful transaction no report points at.
-- One-time request: no plan, or a ONE_TIME plan.

-- 1. Link each report to the payment it covers: the request's earliest successful transaction.
UPDATE "VerificationReport" r
SET "transactionId" = t.id
FROM (
  SELECT DISTINCT ON ("verificationRequestId") id, "verificationRequestId"
  FROM "Transaction"
  WHERE status = 'SUCCESS'
  ORDER BY "verificationRequestId", "paidAt" ASC NULLS LAST, "createdAt" ASC
) t
WHERE r."verificationRequestId" = t."verificationRequestId"
  AND r."transactionId" IS NULL;

-- 2. Keep the agent's notes and checklist with the report.
UPDATE "VerificationReport" r
SET "additionalNotes" = a."additionalNotes"
FROM "AgentAssignment" a
WHERE a."verificationRequestId" = r."verificationRequestId"
  AND r."additionalNotes" IS NULL;

UPDATE "VerificationChecklistItem" c
SET "reportId" = r.id
FROM "AgentAssignment" a
JOIN "VerificationReport" r ON r."verificationRequestId" = a."verificationRequestId"
WHERE c."agentAssignmentId" = a.id
  AND c."reportId" IS NULL;

-- 3. Link each assignment to its period's payment: the report's payment when the period is
--    reported, otherwise the earliest paid period without a report.
UPDATE "AgentAssignment" a
SET "transactionId" = r."transactionId"
FROM "VerificationReport" r
WHERE r."verificationRequestId" = a."verificationRequestId"
  AND a."transactionId" IS NULL;

UPDATE "AgentAssignment" a
SET "transactionId" = (
  SELECT t.id
  FROM "Transaction" t
  WHERE t."verificationRequestId" = a."verificationRequestId"
    AND t.status = 'SUCCESS'
    AND NOT EXISTS (SELECT 1 FROM "VerificationReport" r WHERE r."transactionId" = t.id)
  ORDER BY t."paidAt" ASC NULLS LAST, t."createdAt" ASC
  LIMIT 1
)
WHERE a."transactionId" IS NULL;

-- 4. Assigned requests whose period isn't reported yet are in progress (assigning never set this).
UPDATE "VerificationRequest" vr
SET status = 'IN_PROGRESS'
WHERE vr.status = 'SUBMITTED'
  AND EXISTS (
    SELECT 1
    FROM "AgentAssignment" a
    WHERE a."verificationRequestId" = vr.id
      AND NOT EXISTS (
        SELECT 1 FROM "VerificationReport" r
        WHERE r."verificationRequestId" = vr.id
          AND (r."transactionId" = a."transactionId" OR a."transactionId" IS NULL)
      )
  );

-- 5. One-time requests with a report are finished (nothing set COMPLETED before).
UPDATE "AgentAssignment" a
SET status = 'REPORT_SUBMITTED'
FROM "VerificationRequest" vr
LEFT JOIN "VerificationPlan" p ON p.id = vr."verificationPlanId"
WHERE a."verificationRequestId" = vr.id
  AND (p.id IS NULL OR p.frequency = 'ONE_TIME')
  AND a.status = 'INSPECTION_COMPLETE'
  AND EXISTS (SELECT 1 FROM "VerificationReport" r WHERE r."verificationRequestId" = vr.id);

UPDATE "VerificationRequest" vr
SET status = 'COMPLETED'
WHERE vr.status NOT IN ('COMPLETED', 'CANCELLED')
  AND EXISTS (SELECT 1 FROM "VerificationReport" r WHERE r."verificationRequestId" = vr.id)
  AND (
    vr."verificationPlanId" IS NULL
    OR EXISTS (
      SELECT 1 FROM "VerificationPlan" p
      WHERE p.id = vr."verificationPlanId" AND p.frequency = 'ONE_TIME'
    )
  );

-- 6. Recurring requests whose current period is reported: release the assignment (its notes
--    and checklist are already on the report) and wait for the next period.
DELETE FROM "AgentAssignment" a
USING "VerificationRequest" vr, "VerificationPlan" p
WHERE a."verificationRequestId" = vr.id
  AND p.id = vr."verificationPlanId"
  AND p.frequency <> 'ONE_TIME'
  AND a."transactionId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "VerificationReport" r WHERE r."transactionId" = a."transactionId");

-- Ended subscriptions are left to the webhooks; this only picks the next state.
UPDATE "VerificationRequest" vr
SET status = (
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "Transaction" t
      WHERE t."verificationRequestId" = vr.id
        AND t.status = 'SUCCESS'
        AND NOT EXISTS (SELECT 1 FROM "VerificationReport" r WHERE r."transactionId" = t.id)
    ) THEN 'SUBMITTED'
    ELSE 'AWAITING_RENEWAL'
  END
)::"VerificationStatus"
FROM "VerificationPlan" p
WHERE p.id = vr."verificationPlanId"
  AND p.frequency <> 'ONE_TIME'
  AND vr.status NOT IN ('COMPLETED', 'CANCELLED', 'PAYMENT_FAILED')
  AND NOT EXISTS (SELECT 1 FROM "AgentAssignment" a WHERE a."verificationRequestId" = vr.id)
  AND EXISTS (SELECT 1 FROM "VerificationReport" r WHERE r."verificationRequestId" = vr.id);
