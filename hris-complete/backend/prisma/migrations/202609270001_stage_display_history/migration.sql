ALTER TABLE "application_stage_history"
  ADD COLUMN IF NOT EXISTS "fromDisplayStage" TEXT,
  ADD COLUMN IF NOT EXISTS "toDisplayStage" TEXT;
