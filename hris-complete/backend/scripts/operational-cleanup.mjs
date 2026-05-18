import { mkdir, writeFile, copyFile, access, rm } from 'fs/promises';
import path from 'path';
import { prisma } from '../src/lib/prisma.js';

const mode = process.argv[2] || 'preview';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = process.env.CLEANUP_BACKUP_DIR || path.join(process.cwd(), 'backups', `operational-cleanup-${timestamp}`);
const storageRoot = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'private');
const confirmationToken = process.env.CLEANUP_CONFIRM;

const PRESERVED_TABLES = [
  { key: 'users', label: 'Users / ATS access accounts', count: () => prisma.user.count() },
  { key: 'refreshTokens', label: 'Refresh tokens / active sessions', count: () => prisma.refreshToken.count() },
  { key: 'departments', label: 'Departments / master data', count: () => prisma.department.count() },
  { key: 'gradeBands', label: 'Grade bands / salary structure', count: () => prisma.gradeBand.count() },
  { key: 'employees', label: 'Employees / HR master data', count: () => prisma.employee.count() },
  { key: 'scorecardTemplates', label: 'Scorecard templates', count: () => prisma.scorecardTemplate.count() },
  { key: 'scorecardTemplateCategories', label: 'Scorecard template categories', count: () => prisma.scorecardTemplateCategory.count() },
  { key: 'auditLogs', label: 'Audit logs (preserved)', count: () => prisma.auditLog.count() },
];

const OPERATIONAL_TABLES = [
  {
    key: 'hiringRequests',
    label: 'Hiring requests',
    count: () => prisma.hiringRequest.count(),
    export: () => prisma.hiringRequest.findMany({ orderBy: { createdAt: 'asc' } }),
    clear: () => prisma.hiringRequest.deleteMany(),
  },
  {
    key: 'positions',
    label: 'Job requisitions / positions',
    count: () => prisma.position.count(),
    export: () => prisma.position.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    key: 'candidates',
    label: 'Talent profiles / candidates',
    count: () => prisma.candidate.count(),
    export: () => prisma.candidate.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    key: 'applications',
    label: 'Applications / active hiring pipeline records',
    count: () => prisma.application.count(),
    export: () => prisma.application.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    key: 'applicationStageHistory',
    label: 'Application stage history',
    count: () => prisma.applicationStageHistory.count(),
    export: () => prisma.applicationStageHistory.findMany({ orderBy: { movedAt: 'asc' } }),
    clear: () => prisma.applicationStageHistory.deleteMany(),
  },
  {
    key: 'applicationNotes',
    label: 'Candidate/application notes',
    count: () => prisma.applicationNote.count(),
    export: () => prisma.applicationNote.findMany({ orderBy: { createdAt: 'asc' } }),
    clear: () => prisma.applicationNote.deleteMany(),
  },
  {
    key: 'interviews',
    label: 'Interviews',
    count: () => prisma.interview.count(),
    export: () => prisma.interview.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    key: 'scorecards',
    label: 'Scorecards',
    count: () => prisma.scorecard.count(),
    export: () => prisma.scorecard.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    key: 'scorecardRatings',
    label: 'Scorecard ratings',
    count: () => prisma.scorecardRating.count(),
    export: () => prisma.scorecardRating.findMany(),
    clear: () => prisma.scorecardRating.deleteMany(),
  },
  {
    key: 'offers',
    label: 'Offers',
    count: () => prisma.offer.count(),
    export: () => prisma.offer.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    key: 'approvalSteps',
    label: 'Offer approval steps',
    count: () => prisma.approvalStep.count(),
    export: () => prisma.approvalStep.findMany({ orderBy: [{ offerId: 'asc' }, { stepOrder: 'asc' }] }),
    clear: () => prisma.approvalStep.deleteMany(),
  },
  {
    key: 'offerNotes',
    label: 'Offer notes/comments',
    count: () => prisma.offerNote.count(),
    export: () => prisma.offerNote.findMany({ orderBy: { createdAt: 'asc' } }),
    clear: () => prisma.offerNote.deleteMany(),
  },
  {
    key: 'offerHistory',
    label: 'Offer history',
    count: () => prisma.offerHistory.count(),
    export: () => prisma.offerHistory.findMany({ orderBy: { createdAt: 'asc' } }),
    clear: () => prisma.offerHistory.deleteMany(),
  },
  {
    key: 'fileObjects',
    label: 'CV/resume file metadata',
    count: () => prisma.fileObject.count(),
    export: () => prisma.fileObject.findMany({ orderBy: { createdAt: 'asc' } }),
  },
];

async function tableCounts(definitions) {
  const entries = await Promise.all(
    definitions.map(async definition => ({
      key: definition.key,
      label: definition.label,
      count: await definition.count(),
    })),
  );

  return entries;
}

async function collectSummary() {
  const [operational, preserved] = await Promise.all([
    tableCounts(OPERATIONAL_TABLES),
    tableCounts(PRESERVED_TABLES),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    mode,
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    storageRoot,
    backupDir,
    willClear: operational,
    willPreserve: preserved,
    notModeledAsOperationalTables: [
      'Azure AD / Microsoft login configuration (environment only)',
      'Roles / enums / stages / entities (schema only)',
      'CORS / JWT / backend app settings',
    ],
    deletionScopeNotes: [
      'Rejection of one application should not delete the candidate globally; cleanup targets all operational ATS records intentionally.',
      'There is no separate requisition-notes table in the current schema.',
      'Audit logs are preserved by design in this cleanup plan.',
    ],
  };
}

async function exportJson(name, data) {
  const filePath = path.join(backupDir, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

async function backupOperationalData() {
  await mkdir(backupDir, { recursive: true });
  await mkdir(path.join(backupDir, 'files'), { recursive: true });

  const summary = await collectSummary();
  const fileObjects = await prisma.fileObject.findMany({ orderBy: { createdAt: 'asc' } });

  await exportJson('cleanup-summary', summary);

  for (const table of OPERATIONAL_TABLES) {
    if (!table.export) continue;
    const records = await table.export();
    await exportJson(table.key, records);
  }

  const copiedFiles = [];
  const missingFiles = [];
  for (const file of fileObjects) {
    const source = path.join(storageRoot, file.storageKey);
    const destination = path.join(backupDir, 'files', `${file.id}-${file.storageKey}`);
    try {
      await access(source);
      await copyFile(source, destination);
      copiedFiles.push({
        fileId: file.id,
        storageKey: file.storageKey,
        originalName: file.originalName,
        destination,
      });
    } catch {
      missingFiles.push({
        fileId: file.id,
        storageKey: file.storageKey,
        originalName: file.originalName,
      });
    }
  }

  await exportJson('file-backup-manifest', { copiedFiles, missingFiles });

  return {
    backupDir,
    copiedFiles: copiedFiles.length,
    missingFiles: missingFiles.length,
  };
}

async function executeCleanup() {
  if (confirmationToken !== 'DELETE_OPERATIONAL_ATS_DATA') {
    throw new Error("Refusing to delete data. Set CLEANUP_CONFIRM=DELETE_OPERATIONAL_ATS_DATA to execute.");
  }

  const fileObjects = await prisma.fileObject.findMany({
    select: { id: true, storageKey: true, originalName: true },
  });

  const result = await prisma.$transaction(async tx => {
    const deleted = {};

    deleted.applicationStageHistory = await tx.applicationStageHistory.deleteMany();
    deleted.applicationNotes = await tx.applicationNote.deleteMany();
    deleted.scorecardRatings = await tx.scorecardRating.deleteMany();
    deleted.offerNotes = await tx.offerNote.deleteMany();
    deleted.offerHistory = await tx.offerHistory.deleteMany();
    deleted.approvalSteps = await tx.approvalStep.deleteMany();
    deleted.interviews = await tx.interview.deleteMany();
    deleted.scorecards = await tx.scorecard.deleteMany();
    deleted.offers = await tx.offer.deleteMany();
    deleted.applications = await tx.application.deleteMany();
    deleted.fileObjects = await tx.fileObject.deleteMany();
    deleted.candidates = await tx.candidate.deleteMany();
    deleted.positions = await tx.position.deleteMany();
    deleted.hiringRequests = await tx.hiringRequest.deleteMany();

    return deleted;
  });

  const fileDeletion = [];
  for (const file of fileObjects) {
    const absolutePath = path.join(storageRoot, file.storageKey);
    try {
      await rm(absolutePath, { force: true });
      fileDeletion.push({ fileId: file.id, storageKey: file.storageKey, deleted: true });
    } catch (error) {
      fileDeletion.push({ fileId: file.id, storageKey: file.storageKey, deleted: false, error: error.message });
    }
  }

  return { deleted: result, fileDeletion };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  if (mode === 'preview') {
    const summary = await collectSummary();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (mode === 'backup') {
    const result = await backupOperationalData();
    console.log(JSON.stringify({ mode, ...result }, null, 2));
    return;
  }

  if (mode === 'execute') {
    const result = await executeCleanup();
    console.log(JSON.stringify({ mode, ...result }, null, 2));
    return;
  }

  throw new Error(`Unknown mode "${mode}". Use preview, backup, or execute.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
