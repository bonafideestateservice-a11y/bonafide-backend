ALTER TABLE "VerificationTier"
ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "VerificationTier"
SET "features" = ARRAY[
  'One site visit',
  'Brief local enquiries',
  'Photos or video where needed',
  'One short report'
]::TEXT[]
WHERE "code" = 'BASIC';

UPDATE "VerificationTier"
SET "features" = ARRAY[
  'Everything in Basic',
  'Land registry check',
  'Court-records search',
  'Local intelligence gathering',
  'One detailed report'
]::TEXT[]
WHERE "code" = 'STANDARD';

UPDATE "VerificationTier"
SET "features" = ARRAY[
  'Everything in Standard',
  'Property valuation',
  'Feasibility report for the property''s intended use'
]::TEXT[]
WHERE "code" = 'PREMIUM';

ALTER TABLE "VerificationRequest"
ADD COLUMN "intendedUse" TEXT;

ALTER TABLE "PremiumQuote"
ADD COLUMN "scopeSummary" TEXT;
