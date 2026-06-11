ALTER TABLE "applications" ADD COLUMN "displayStage" TEXT;

UPDATE "applications"
SET "displayStage" = CASE "stage"
  WHEN 'applied' THEN 'Applied'
  WHEN 'screening' THEN 'HR Screening'
  WHEN 'interview' THEN '1st Interview'
  WHEN 'assessment' THEN 'Technical Interview'
  WHEN 'offer' THEN 'Offer'
  WHEN 'hired' THEN 'Hired'
  WHEN 'rejected' THEN 'Rejected'
  ELSE INITCAP("stage"::TEXT)
END
WHERE "displayStage" IS NULL;
