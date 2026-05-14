import { Router } from 'express';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { ok, created, badRequest, notFound, forbidden } from '../lib/response.js';
import { authenticate, requireRoles, CAN_WRITE_CANDIDATES, buildApplicationScopeWhere, ROLES } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const filesRouter = Router();
filesRouter.use(authenticate);

const storageRoot = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'private');

function safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function canReadCandidateFile(user, candidateId) {
  if ([ROLES.ADMIN, ROLES.RECRUITER].includes(user.role)) return true;
  const count = await prisma.application.count({
    where: {
      candidateId,
      ...buildApplicationScopeWhere(user),
    },
  });
  return count > 0;
}

filesRouter.post('/cv', requireRoles(CAN_WRITE_CANDIDATES), async (req, res, next) => {
  try {
    const { candidateId, filename, mimeType, base64 } = req.body;
    if (!candidateId || !filename || !base64) {
      return badRequest(res, 'candidateId, filename, and base64 are required');
    }

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) return notFound(res, 'Candidate');

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return badRequest(res, 'Uploaded file is empty');
    if (buffer.length > 10 * 1024 * 1024) return badRequest(res, 'CV file must be 10MB or smaller');

    await mkdir(storageRoot, { recursive: true });
    const storageKey = `${Date.now()}-${crypto.randomUUID()}-${safeName(filename)}`;
    const absolutePath = path.join(storageRoot, storageKey);
    const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    await writeFile(absolutePath, buffer, { flag: 'wx' });

    const file = await prisma.fileObject.create({
      data: {
        candidateId,
        uploadedById: req.user.id,
        originalName: filename,
        storageKey,
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
        purpose: 'cv',
        checksumSha256,
      },
    });

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { resumeUrl: `/api/v1/files/${file.id}` },
    });

    await auditLog(req, {
      action: 'created',
      entity: 'files',
      entityId: file.id,
      after: { candidateId, filename, sizeBytes: buffer.length },
    });

    return created(res, file);
  } catch (err) {
    next(err);
  }
});

filesRouter.get('/:id', async (req, res, next) => {
  try {
    const file = await prisma.fileObject.findUnique({ where: { id: req.params.id } });
    if (!file) return notFound(res, 'File');
    if (file.candidateId && !(await canReadCandidateFile(req.user, file.candidateId))) {
      return forbidden(res, 'You do not have access to this candidate file');
    }

    const bytes = await readFile(path.join(storageRoot, file.storageKey));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName(file.originalName)}"`);
    return res.send(bytes);
  } catch (err) {
    next(err);
  }
});
