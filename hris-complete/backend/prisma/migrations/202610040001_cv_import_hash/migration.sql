ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "cvImportHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_cvImportHash_key" ON "candidates"("cvImportHash");
