-- "VerificationReport" is created (with this column and index) by
-- 20260918000000_repair_verification_models. Guarded so a fresh database can apply the
-- migration history in order; databases that already ran this are unaffected.
ALTER TABLE IF EXISTS "VerificationReport" ADD COLUMN IF NOT EXISTS "viewedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF to_regclass('"VerificationReport"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "VerificationReport_viewedAt_idx" ON "VerificationReport"("viewedAt");
  END IF;
END $$;
