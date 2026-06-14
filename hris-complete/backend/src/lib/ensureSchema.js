import { prisma } from './prisma.js';

export async function ensureRuntimeSchema() {
  if (process.env.SKIP_RUNTIME_SCHEMA_ENSURE === 'true') return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS "positions"
    ADD COLUMN IF NOT EXISTS "headcount" INTEGER NOT NULL DEFAULT 1;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS "applications"
    ADD COLUMN IF NOT EXISTS "displayStage" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
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
  `);
}
