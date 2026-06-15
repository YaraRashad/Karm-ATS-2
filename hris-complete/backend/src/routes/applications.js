// ─── Applications Routes ──────────────────────────────────────────────
// GET    /api/v1/applications
// POST   /api/v1/applications
// GET    /api/v1/applications/:id
// PATCH  /api/v1/applications/:id/stage      — move stage
// PATCH  /api/v1/applications/:id/position   — change requisition
// POST   /api/v1/applications/:id/disqualify
// POST   /api/v1/applications/:id/notes
// DELETE /api/v1/applications/:id/notes/:noteId

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import {
  ok, created, noContent, badRequest, notFound, unprocessable, paginated,
} from '../lib/response.js';
import {
  authenticate, scopeToUserEntities,
  requireRoles, CAN_WRITE_CANDIDATES,
  buildApplicationScopeWhere, stripSalaryFields, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const applicationsRouter = Router();
applicationsRouter.use(authenticate, scopeToUserEntities);

const STAGES = ['applied','screening','interview','assessment','offer','hired','rejected'];

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { badRequest(res, 'Validation failed', e.array()); return false; }
  return true;
}

// ── GET /applications ─────────────────────────────────────────────────
applicationsRouter.get('/', async (req, res, next) => {
  try {
    const {
      page = 1, pageSize = 25,
      positionId, stage, entity, source,
      candidateId, search,
      sortBy = 'appliedAt', sortDir = 'desc',
    } = req.query;

    const entityWhere = req.entityFilter
      ? { position: { entity: { in: req.entityFilter } } }
      : {};

    const scopedWhere = buildApplicationScopeWhere(req.user);
    const queryWhere = {
      OR: [
        { isActive: true },
        { stage: 'rejected' },
      ],
      ...(positionId  && { positionId }),
      ...(candidateId && { candidateId }),
      ...(stage       && { stage }),
      ...(entity      && { position: { entity } }),
      ...(source      && { candidate: { source } }),
      ...(search      && {
        OR: [
          { candidate: { firstName: { contains: search, mode: 'insensitive' } } },
          { candidate: { lastName:  { contains: search, mode: 'insensitive' } } },
          { candidate: { email:     { contains: search, mode: 'insensitive' } } },
          { candidate: { currentCompany: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };
    const where = { AND: [scopedWhere, entityWhere, queryWhere] };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where, skip: (parseInt(page)-1) * parseInt(pageSize), take: parseInt(pageSize),
        orderBy: { [sortBy]: sortDir },
        include: {
          candidate: {
            select: {
              id: true, firstName: true, lastName: true, email: true,
              currentTitle: true, currentCompany: true, source: true,
              totalYearsExp: true, tags: true, noticePeriodDays: true,
            },
          },
          position: {
            select: { id: true, title: true, entity: true, department: { select: { name: true } } },
          },
          scorecards: {
            where: { submittedAt: { not: null } },
            select: { compositeScore: true, recommendation: true },
          },
          interviews: {
            where: { status: 'scheduled' },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
          },
          _count: { select: { scorecards: true, interviews: true } },
        },
      }),
      prisma.application.count({ where }),
    ]);

    const enriched = applications.map(a => {
      const scores = a.scorecards.map(s => parseFloat(s.compositeScore)).filter(Boolean);
      return {
        ...a,
        averageScore: scores.length
          ? +(scores.reduce((s,n) => s+n, 0) / scores.length).toFixed(2)
          : null,
        daysInProcess: Math.floor((Date.now() - new Date(a.appliedAt)) / 86400000),
        daysInStage:   Math.floor((Date.now() - new Date(a.stageEnteredAt)) / 86400000),
      };
    });

    return paginated(res, stripSalaryFields(req.user, enriched), {
      page: parseInt(page), pageSize: parseInt(pageSize), total,
    });
  } catch (err) { next(err); }
});

// ── POST /applications ────────────────────────────────────────────────
applicationsRouter.post(
  '/',
  requireRoles(CAN_WRITE_CANDIDATES),
  [
    body('candidateId').notEmpty(),
    body('positionId').notEmpty(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { candidateId, positionId } = req.body;

      // Check both exist
      const [candidate, position] = await Promise.all([
        prisma.candidate.findUnique({ where: { id: candidateId } }),
        prisma.position.findUnique({
          where: { id: positionId },
          select: { id: true, status: true, entity: true },
        }),
      ]);

      if (!candidate) return notFound(res, 'Candidate');
      if (!position)  return notFound(res, 'Position');

      // Check for duplicate
      const existing = await prisma.application.findUnique({
        where: { candidateId_positionId: { candidateId, positionId } },
      });
      if (existing) {
        if (existing.isActive) {
          return unprocessable(res, 'Candidate already has an active application for this position');
        }
        // Reactivate withdrawn application
        const reactivated = await prisma.application.update({
          where: { id: existing.id },
          data:  { isActive: true, stage: 'applied', displayStage: 'Applied', stageEnteredAt: new Date(), disqualifyReason: null },
        });
        return ok(res, reactivated);
      }

      const application = await prisma.application.create({
        data: { candidateId, positionId, stage: 'applied', displayStage: 'Applied', stageEnteredAt: new Date() },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          position:  { select: { id: true, title: true, entity: true } },
        },
      });

      return created(res, application);
    } catch (err) { next(err); }
  }
);

// ── GET /applications/:id ─────────────────────────────────────────────
applicationsRouter.get('/:id', async (req, res, next) => {
  try {
    const application = await prisma.application.findFirst({
      where: { id: req.params.id, ...buildApplicationScopeWhere(req.user) },
      include: {
        candidate: true,
        position: {
          include: {
            department:        { select: { name: true } },
            scorecardTemplate: { include: { categories: { orderBy: { order: 'asc' } } } },
          },
        },
        scorecards: {
          include: {
            interviewer: { select: { id: true, firstName: true, lastName: true } },
            ratings: {
              include: { category: true },
              orderBy: { category: { order: 'asc' } },
            },
            template: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        interviews: {
          include: {
            interviewer: { select: { id: true, firstName: true, lastName: true } },
            scorecard:   { select: { id: true, submittedAt: true, compositeScore: true, recommendation: true } },
          },
          orderBy: { scheduledAt: 'asc' },
        },
        offers: {
          include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
        notes: {
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        stageHistory: { orderBy: { movedAt: 'asc' } },
      },
    });

    if (!application) return notFound(res, 'Application');

    const scores = application.scorecards
      .filter(s => s.submittedAt && s.compositeScore)
      .map(s => parseFloat(s.compositeScore));

    return ok(res, stripSalaryFields(req.user, {
      ...application,
      averageScore:  scores.length ? +(scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(2) : null,
      daysInProcess: Math.floor((Date.now() - new Date(application.appliedAt)) / 86400000),
      daysInStage:   Math.floor((Date.now() - new Date(application.stageEnteredAt)) / 86400000),
    }));
  } catch (err) { next(err); }
});

// ── PATCH /applications/:id/position ──────────────────────────────────
applicationsRouter.patch(
  '/:id/position',
  requireRoles(CAN_WRITE_CANDIDATES),
  [body('positionId').notEmpty().withMessage('Position is required')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { positionId } = req.body;
      const application = await prisma.application.findFirst({
        where: { id: req.params.id, ...buildApplicationScopeWhere(req.user) },
        select: { id: true, candidateId: true, positionId: true, stage: true },
      });
      if (!application) return notFound(res, 'Application');

      const position = await prisma.position.findUnique({
        where: { id: positionId },
        select: { id: true, title: true },
      });
      if (!position) return notFound(res, 'Position');
      if (application.positionId === positionId) {
        return unprocessable(res, 'Application is already assigned to this requisition');
      }

      const duplicate = await prisma.application.findUnique({
        where: { candidateId_positionId: { candidateId: application.candidateId, positionId } },
      });
      if (duplicate) {
        return unprocessable(res, 'Candidate already has an application for this requisition');
      }

      const now = new Date();
      const [updated] = await prisma.$transaction([
        prisma.application.update({
          where: { id: req.params.id },
          data: {
            positionId,
            stage: 'applied',
            displayStage: 'Applied',
            stageEnteredAt: now,
            isActive: true,
            disqualifyReason: null,
          },
        }),
        prisma.applicationStageHistory.create({
          data: {
            applicationId: req.params.id,
            fromStage: application.stage,
            toStage: 'applied',
            movedById: req.user.id,
            reason: `Requisition changed to ${position.title}`,
          },
        }),
      ]);

      await auditLog(req, {
        action: 'updated',
        entity: 'applications',
        entityId: req.params.id,
        before: { positionId: application.positionId },
        after: { positionId, change: 'requisition_changed' },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  },
);

// ── PATCH /applications/:id/stage ─────────────────────────────────────
applicationsRouter.patch(
  '/:id/stage',
  requireRoles(CAN_WRITE_CANDIDATES),
  [body('stage').isIn(STAGES).withMessage(`Stage must be one of: ${STAGES.join(', ')}`)],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { stage, reason, displayStage } = req.body;
      const application = await prisma.application.findFirst({
        where: { id: req.params.id, ...buildApplicationScopeWhere(req.user) },
        select: { id: true, stage: true, displayStage: true, isActive: true, disqualifyReason: true },
      });

      if (!application) return notFound(res, 'Application');
      const reactivatingRejected = !application.isActive && application.stage === 'rejected' && stage !== 'rejected';
      if (!application.isActive && !reactivatingRejected) return unprocessable(res, 'Application is not active');
      const nextDisplayStage = displayStage || null;
      if (application.stage === stage && application.displayStage === nextDisplayStage) {
        return unprocessable(res, 'Already in this stage');
      }

      // Record history and update in a transaction
      const [updated] = await prisma.$transaction([
        prisma.application.update({
          where: { id: req.params.id },
          data:  {
            stage,
            displayStage: nextDisplayStage,
            stageEnteredAt: new Date(),
            isActive: stage !== 'rejected',
            disqualifyReason: stage === 'rejected' ? (reason || application.disqualifyReason) : null,
          },
        }),
        prisma.applicationStageHistory.create({
          data: {
            applicationId: req.params.id,
            fromStage:     application.stage,
            toStage:       stage,
            movedById:     req.user.id,
            reason,
          },
        }),
      ]);

      await auditLog(req, {
        action: 'candidate_moved',
        entity: 'applications',
        entityId: req.params.id,
        before: { stage: application.stage },
        after: { stage, reason },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── POST /applications/:id/disqualify ─────────────────────────────────
applicationsRouter.post(
  '/:id/disqualify',
  requireRoles(CAN_WRITE_CANDIDATES),
  [body('reason').notEmpty().withMessage('Disqualification reason required')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { reason } = req.body;
      const application = await prisma.application.findFirst({
        where: { id: req.params.id, ...buildApplicationScopeWhere(req.user) },
      });
      if (!application) return notFound(res, 'Application');

      const [updated] = await prisma.$transaction([
        prisma.application.update({
          where: { id: req.params.id },
          data:  { stage: 'rejected', displayStage: 'Rejected', stageEnteredAt: new Date(), disqualifyReason: reason, isActive: false },
        }),
        prisma.applicationStageHistory.create({
          data: {
            applicationId: req.params.id,
            fromStage:     application.stage,
            toStage:       'rejected',
            movedById:     req.user.id,
            reason,
          },
        }),
      ]);

      await auditLog(req, {
        action: 'rejected',
        entity: 'applications',
        entityId: req.params.id,
        before: { stage: application.stage },
        after: { stage: 'rejected', reason },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── POST /applications/:id/notes ──────────────────────────────────────
applicationsRouter.post(
  '/:id/notes',
  requireRoles(CAN_WRITE_CANDIDATES),
  [
    body('content').notEmpty().trim().withMessage('Note content required'),
    body('isInternal').isBoolean().optional(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const application = await prisma.application.findFirst({
        where: { id: req.params.id, ...buildApplicationScopeWhere(req.user) },
      });
      if (!application) return notFound(res, 'Application');

      const note = await prisma.applicationNote.create({
        data: {
          applicationId: req.params.id,
          authorId:      req.user.id,
          content:       req.body.content,
          isInternal:    req.body.isInternal ?? true,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return created(res, note);
    } catch (err) { next(err); }
  }
);

// ── DELETE /applications/:id/notes/:noteId ────────────────────────────
applicationsRouter.delete(
  '/:id/notes/:noteId',
  requireRoles(CAN_WRITE_CANDIDATES),
  async (req, res, next) => {
    try {
      const note = await prisma.applicationNote.findUnique({
        where: { id: req.params.noteId },
      });
      if (!note) return notFound(res, 'Note');

      // Only the note author or Admin can delete
      if (note.authorId !== req.user.id && req.user.role !== ROLES.ADMIN) {
        return forbidden(res, 'Only the note author can delete this note');
      }

      await prisma.applicationNote.delete({ where: { id: req.params.noteId } });
      return noContent(res);
    } catch (err) { next(err); }
  }
);
