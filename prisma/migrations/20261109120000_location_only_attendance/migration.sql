-- Add location attendance while preserving existing modes and records.
ALTER TYPE "AttendanceMode" ADD VALUE 'LOCATION_ONLY';
ALTER TYPE "VerificationMethod" ADD VALUE 'LOCATION';
