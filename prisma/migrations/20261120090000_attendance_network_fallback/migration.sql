ALTER TYPE "VerificationMethod" ADD VALUE 'NETWORK_FALLBACK';

ALTER TABLE "attendance_records" ADD COLUMN "clockOutVerificationMethod" "VerificationMethod";
