import { mkdir, writeFile, copyFile, access, rm } from 'fs/promises';
import path from 'path';
import { prisma } from '../src/lib/prisma.js';

const mode = process.argv[2] || 'preview';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = process.env.CLEANUP_BACKUP_DIR || path.join(process.cwd(), 'backups', `operational-cleanup-${timestamp}`);
const storageRoot = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'private');
const confirmationToken = process.env.CLEANUP_CONFIRM;

function getDelegate(name) {
  return prisma[name] ?? null;
}

function requiredDelegate(name, label) {
  const delegate = getDelegate(name);
  if (!delegate) {
    throw new Error(`${label} is not available in the deployed Prisma client (missing delegate: ${name}).`);
  }
  return delegate;
}

function optionalTable(name, label, config = {}) {
  return {
    key: config.key || name,
    label,
    delegateName: name,
    required: Boolean(config.required),
    count: async () => {
      const delegate = getDelegate(name);
      if (!delegate) return null;
      return delegate.count();
    },
    export: async () => {
      const delegate = getDelegate(name);
      if (!delegate) return [];
      return delegate.findMany(config.findManyArgs || {});
    },
    clear: async tx => {
      const delegate = tx?.[name] ?? getDelegate(name);
      if (!delegate) return { count: 0, skipped: true };
      return delegate.deleteMany();
    },
  };
}

const PRESERVED_TABLES = [
  optionalTable('user', 'Users / ATS access accounts', { key: 'users', required: true }),
  optionalTable('refreshToken', 'Refresh tokens / active sessions', { key: 'refreshTokens', required: true }),
  optionalTable('department', 'Departments / master data', { key: 'departments', required: true }),
  optionalTable('gradeBand', 'Grade bands / salary structure', { key: 'gradeBands' }),
  optionalTable('employee', 'Employees / HR master data', { key: 'employees' }),
  optionalTable('scorecardTemplate', 'Scorecard templates', { key: 'scorecardTemplates' }),
  optionalTable('scorecardTemplateCategory', 'Scorecard template categories', { key: 'scorecardTemplateCategories' }),
  optionalTable('auditLog', 'Audit logs (preserved)', { key: 'auditLogs', required: true }),
];

const OPERATIONAL_TABLES = [
  optionalTable('hiringRequest', 'Hiring requests', {
    key: 'hiringRequests',
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  // Delete operational children first, then parent workflow records.
  optionalTable('approvalStep', 'Offer approval steps', {
    key: 'approvalSteps',
    findManyArgs: { orderBy: [{ offerId: 'asc' }, { stepOrder: 'asc' }] },
  }),
  optionalTable('offerNote', 'Offer notes/comments', {
    key: 'offerNotes',
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('offerHistory', 'Offer history', {
    key: 'offerHistory',
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('offer', 'Offers', {
    key: 'offers',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('interview', 'Interviews', {
    key: 'interviews',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('scorecardRating', 'Scorecard ratings', {
    key: 'scorecardRatings',
  }),
  optionalTable('scorecard', 'Scorecards', {
    key: 'scorecards',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('applicationStageHistory', 'Application stage history', {
    key: 'applicationStageHistory',
    findManyArgs: { orderBy: { movedAt: 'asc' } },
  }),
  optionalTable('applicationNote', 'Candidate/application notes', {
    key: 'applicationNotes',
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('application', 'Applications / active hiring pipeline records', {
    key: 'applications',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('fileObject', 'CV/resume file metadata', {
    key: 'fileObjects',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('candidate', 'Talent profiles / candidates', {
    key: 'candidates',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
  optionalTable('position', 'Job requisitions / positions', {
    key: 'positions',
    required: true,
    findManyArgs: { orderBy: { createdAt: 'asc' } },
  }),
];

async function tableCounts(definitions) {
  const entries = await Promise.all(
    definitions.map(async definition => {
      const count = await definition.count();
      return {
        key: definition.key,
        label: definition.label,
        count,
        availableInDeployedBackend: count !== null,
        required: Boolean(definition.required),
      };
    }),
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
  const fileDelegate = requiredDelegate('fileObject', 'CV/resume file metadata');
  const fileObjects = await fileDelegate.findMany({ orderBy: { createdAt: 'asc' } });

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

  const fileDelegate = requiredDelegate('fileObject', 'CV/resume file metadata');
  const fileObjects = await fileDelegate.findMany({
    select: { id: true, storageKey: true, originalName: true },
  });

  const result = await prisma.$transaction(async tx => {
    const deleted = {};

    for (const table of OPERATIONAL_TABLES) {
      deleted[table.key] = await table.clear(tx);
    }

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
