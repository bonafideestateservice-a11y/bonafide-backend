DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "VerificationPlan"
    WHERE upper("currency") NOT IN ('USD', 'NGN')
  ) THEN
    RAISE EXCEPTION 'Cannot convert verification plan prices with unsupported currencies';
  END IF;
END $$;

ALTER TABLE "VerificationPlan"
  ADD COLUMN "priceUsdCents" INTEGER,
  ADD COLUMN "priceNgnKobo" INTEGER,
  ADD COLUMN "paystackNgnPlanCode" TEXT;

UPDATE "VerificationPlan"
SET
  "priceUsdCents" = CASE
    WHEN upper("currency") = 'USD' THEN "priceInCents"
    ELSE round("priceInCents" / 1600.0)::INTEGER
  END,
  "priceNgnKobo" = CASE
    WHEN upper("currency") = 'NGN' THEN "priceInCents"
    ELSE "priceInCents" * 1600
  END;

ALTER TABLE "VerificationPlan"
  ALTER COLUMN "priceUsdCents" SET NOT NULL,
  ALTER COLUMN "priceNgnKobo" SET NOT NULL,
  DROP COLUMN "priceInCents",
  DROP COLUMN "currency";

CREATE UNIQUE INDEX "VerificationPlan_paystackNgnPlanCode_key"
  ON "VerificationPlan"("paystackNgnPlanCode");
