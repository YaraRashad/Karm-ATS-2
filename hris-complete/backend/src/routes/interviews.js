// ─── Interviews Routes ────────────────────────────────────────────────
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { ok, created, noContent, badRequest, notFound, unprocessable } from '../lib/response.js';
import {
  authenticate, requireRoles, CAN_WRITE_CANDIDATES,
  buildApplicationScopeWhere, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const interviewsRouter = Router();
interviewsRouter.use(authenticate);

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { badRequest(res, 'Validation failed', e.array()); return false; }
  return true;
}

// GET /interviews?applicationId=
interviewsRouter.get('/', requireRoles([ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER, ROLES.INTERVIEWER]), async (req, res, next) => {
  try {
    const { applicationId, interviewerId, status } = req.query;
    const interviews = await prisma.interview.findMany({
      where: {
        application: buildApplicationScopeWhere(req.user),
        ...(applicationId  && { applicationId }),
        ...(interviewerId  && req.user.role !== ROLES.INTERVIEWER && { interviewerId }),
        ...(req.user.role === ROLES.INTERVIEWER && { interviewerId: req.user.id }),
        ...(status         && { status }),
      },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        scorecard:   { select: { id: true, submittedAt: true, compositeScore: true } },
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true } },
            position:  { select: { title: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return ok(res, interviews);
  } catch (err) { next(err); }
});

// POST /interviews
interviewsRouter.post(
  '/',
  requireRoles(CAN_WRITE_CANDIDATES),
  [
    body('applicationId').notEmpty(),
    body('interviewerId').optional(),
    body('interviewerEmail').isEmail().optional(),
    body('type').isIn(['phone_screen','technical','behavioral','panel','final','case_study']),
    body('scheduledAt').isISO8601(),
    body('durationMinutes').isInt({ min: 15, max: 480 }).optional(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { applicationId, interviewerId, interviewerEmail, type, scheduledAt, durationMinutes, meetingLink, location } = req.body;
      if (!interviewerId && !interviewerEmail) {
        return badRequest(res, 'Interviewer is required');
      }

      const [application, interviewer] = await Promise.all([
        prisma.application.findFirst({
          where: { id: applicationId, ...buildApplicationScopeWhere(req.user) },
          select: { id: true, isActive: true },
        }),
        interviewerId
          ? prisma.user.findUnique({ where: { id: interviewerId }, select: { id: true, isActive: true } })
          : prisma.user.findUnique({ where: { email: interviewerEmail }, select: { id: true, isActive: true } }),
      ]);

      if (!application) return notFound(res, 'Application');
      if (!application.isActive) return unprocessable(res, 'Application is not active');
      if (!interviewer) return notFound(res, 'Interviewer');

      const interview = await prisma.interview.create({
        data: {
          applicationId,
          interviewerId: interviewer.id,
          type,
          scheduledAt:    new Date(scheduledAt),
          durationMinutes: durationMinutes || 60,
          meetingLink,
          location,
          status: 'scheduled',
        },
        include: {
          interviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await auditLog(req, {
        action: 'interview_scheduled',
        entity: 'interviews',
        entityId: interview.id,
        after: { applicationId, interviewerId: interviewer.id, type, scheduledAt },
      });

      return created(res, interview);
    } catch (err) { next(err); }
  }
);

// PATCH /interviews/:id
interviewsRouter.patch('/:id', requireRoles(CAN_WRITE_CANDIDATES), async (req, res, next) => {
  try {
    const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
    if (!interview) return notFound(res, 'Interview');

    const allowed = ['scheduledAt','durationMinutes','meetingLink','location','status'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (updates.scheduledAt) updates.scheduledAt = new Date(updates.scheduledAt);

    const updated = await prisma.interview.update({
      where: { id: req.params.id },
      data:  updates,
    });
    return ok(res, updated);
  } catch (err) { next(err); }
});

// DELETE /interviews/:id
interviewsRouter.delete('/:id', requireRoles(CAN_WRITE_CANDIDATES), async (req, res, next) => {
  try {
    const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
    if (!interview) return notFound(res, 'Interview');
    if (interview.status === 'completed') {
      return unprocessable(res, 'Cannot delete a completed interview');
    }
    await prisma.interview.update({
      where: { id: req.params.id },
      data:  { status: 'cancelled' },
    });
    return noContent(res);
  } catch (err) { next(err); }
});
