// ─── Candidates Routes ────────────────────────────────────────────────
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { ok, created, noContent, badRequest, notFound, conflict, paginated } from '../lib/response.js';
import {
  authenticate, scopeToUserEntities, requireRoles, CAN_READ_CANDIDATES,
  CAN_WRITE_CANDIDATES, buildApplicationScopeWhere, stripSalaryFields, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const candidatesRouter = Router();
candidatesRouter.use(authenticate, scopeToUserEntities);

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { badRequest(res, 'Validation failed', e.array()); return false; }
  return true;
}

function generatedCandidateEmail() {
  return `no-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@no-email.local`;
}

function normalizeCandidateEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || generatedCandidateEmail();
}

const candidateBody = [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
  body('source').isIn(['linkedin','referral','direct','agency','job_board','internal','other']).optional(),
  body('totalYearsExp').isInt({ min: 0 }).optional(),
  body('noticePeriodDays').isInt({ min: 0 }).optional(),
  body('salaryExpectation').isInt({ min: 0 }).optional(),
];

// GET /candidates
candidatesRouter.get('/', requireRoles(CAN_READ_CANDIDATES), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 25, search, source, tags } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const where = {
      isActive: true,
      ...([ROLES.HIRING_MANAGER, ROLES.INTERVIEWER].includes(req.user.role)
        ? { applications: { some: buildApplicationScopeWhere(req.user) } }
        : {}),
      ...(source && { source }),
      ...(tags   && { tags: { hasSome: tags.split(',') } }),
      ...(search && {
        OR: [
          { firstName:      { contains: search, mode: 'insensitive' } },
          { lastName:       { contains: search, mode: 'insensitive' } },
          { email:          { contains: search, mode: 'insensitive' } },
          { currentCompany: { contains: search, mode: 'insensitive' } },
          { currentTitle:   { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { applications: true } },
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    return paginated(res, stripSalaryFields(req.user, candidates), { page: parseInt(page), pageSize: parseInt(pageSize), total });
  } catch (err) { next(err); }
});

// POST /candidates
candidatesRouter.post('/', requireRoles(CAN_WRITE_CANDIDATES), candidateBody, async (req, res, next) => {
  if (!validate(req, res)) return;
  try {
    const email = normalizeCandidateEmail(req.body.email);
    const existing = await prisma.candidate.findUnique({ where: { email } });
    if (existing) {
      if (!existing.isActive) {
        const reactivated = await prisma.candidate.update({
          where: { id: existing.id },
          data: { ...req.body, email, isActive: true },
        });
        return ok(res, reactivated);
      }
      return conflict(res, 'A candidate with this email already exists');
    }

    const candidate = await prisma.candidate.create({
      data: {
        firstName:        req.body.firstName,
        lastName:         req.body.lastName,
        email,
        phone:            req.body.phone,
        linkedinUrl:      req.body.linkedinUrl,
        currentTitle:     req.body.currentTitle,
        currentCompany:   req.body.currentCompany,
        totalYearsExp:    req.body.totalYearsExp,
        location:         req.body.location,
        nationality:      req.body.nationality,
        noticePeriodDays: req.body.noticePeriodDays,
        salaryExpectation:req.body.salaryExpectation,
        salaryCurrency:   req.body.salaryCurrency,
        source:           req.body.source || 'direct',
        tags:             req.body.tags   || [],
      },
    });

    await auditLog(req, {
      action: 'created',
      entity: 'candidates',
      entityId: candidate.id,
      after: { email: candidate.email, source: candidate.source },
    });

    return created(res, candidate);
  } catch (err) { next(err); }
});

// GET /candidates/:id
candidatesRouter.get('/:id', requireRoles(CAN_READ_CANDIDATES), async (req, res, next) => {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params.id },
      include: {
        applications: {
          include: {
            position: { select: { id: true, title: true, entity: true, status: true } },
            scorecards: {
              where:  { submittedAt: { not: null } },
              select: { compositeScore: true, recommendation: true },
            },
          },
          orderBy: { appliedAt: 'desc' },
        },
      },
    });

    if (!candidate) return notFound(res, 'Candidate');
    if ([ROLES.HIRING_MANAGER, ROLES.INTERVIEWER].includes(req.user.role)) {
      const scopedCount = await prisma.application.count({
        where: {
          candidateId: req.params.id,
          ...buildApplicationScopeWhere(req.user),
        },
      });
      if (scopedCount === 0) return notFound(res, 'Candidate');
    }
    return ok(res, stripSalaryFields(req.user, candidate));
  } catch (err) { next(err); }
});

// PATCH /candidates/:id
candidatesRouter.patch('/:id', requireRoles(CAN_WRITE_CANDIDATES), async (req, res, next) => {
  try {
    const candidate = await prisma.candidate.findUnique({ where: { id: req.params.id } });
    if (!candidate) return notFound(res, 'Candidate');

    const allowed = [
      'firstName','lastName','email','phone','linkedinUrl','currentTitle','currentCompany',
      'totalYearsExp','location','nationality','noticePeriodDays','salaryExpectation',
      'salaryCurrency','source','tags','resumeUrl',
    ];

    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    if (updates.email !== undefined) updates.email = normalizeCandidateEmail(updates.email);

    if (updates.email && updates.email !== candidate.email) {
      const duplicate = await prisma.candidate.findUnique({ where: { email: updates.email } });
      if (duplicate) return conflict(res, 'A candidate with this email already exists');
    }

    const updated = await prisma.candidate.update({ where: { id: req.params.id }, data: updates });
    return ok(res, updated);
  } catch (err) { next(err); }
});

// DELETE /candidates/:id (soft)
candidatesRouter.delete('/:id', requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const candidate = await prisma.candidate.findUnique({ where: { id: req.params.id } });
    if (!candidate) return notFound(res, 'Candidate');
    const [updated, applications] = await prisma.$transaction([
      prisma.candidate.update({ where: { id: req.params.id }, data: { isActive: false } }),
      prisma.application.updateMany({
        where: { candidateId: req.params.id },
        data: { isActive: false },
      }),
    ]);
    await auditLog(req, {
      action: 'deleted',
      entity: 'candidates',
      entityId: candidate.id,
      before: {
        email: candidate.email,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        source: candidate.source,
        isActive: candidate.isActive,
      },
      after: { isActive: updated.isActive, inactiveApplications: applications.count },
    });
    return noContent(res);
  } catch (err) { next(err); }
});
