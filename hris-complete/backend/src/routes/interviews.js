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

function computeComposite(ratings) {
  const totalWeight = ratings.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return null;
  const weightedSum = ratings.reduce((sum, r) => sum + (r.score * (r.weight / 100)), 0);
  const normalised = weightedSum / (totalWeight / 100);
  return Math.round(normalised * 100) / 100;
}

function mapRecommendation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strong hire' || normalized === 'strong_yes') return 'strong_yes';
  if (normalized === 'hire' || normalized === 'yes') return 'yes';
  if (normalized === 'no hire' || normalized === 'no') return 'no';
  return 'neutral';
}

function splitManualName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'External',
    lastName: parts.slice(1).join(' ') || 'Interviewer',
  };
}

function manualInterviewerEmail(name) {
  const slug = String(name || 'external-interviewer')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'external-interviewer';
  return `${slug}@manual-interviewer.local`;
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
        interviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
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
    body('interviewerName').optional().isString(),
    body('type').isIn(['phone_screen','technical','behavioral','panel','final','case_study']),
    body('scheduledAt').isISO8601(),
    body('durationMinutes').isInt({ min: 15, max: 480 }).optional(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { applicationId, interviewerId, interviewerEmail, interviewerName, type, scheduledAt, durationMinutes, meetingLink, location } = req.body;
      const manualName = String(interviewerName || '').trim();
      if (!interviewerId && !interviewerEmail && !manualName) {
        return badRequest(res, 'Interviewer is required');
      }

      const [application, existingInterviewer] = await Promise.all([
        prisma.application.findFirst({
          where: { id: applicationId, ...buildApplicationScopeWhere(req.user) },
          select: { id: true, isActive: true },
        }),
        interviewerId
          ? prisma.user.findUnique({ where: { id: interviewerId }, select: { id: true, isActive: true } })
          : interviewerEmail
            ? prisma.user.findUnique({ where: { email: interviewerEmail }, select: { id: true, isActive: true } })
            : Promise.resolve(null),
      ]);

      if (!application) return notFound(res, 'Application');
      if (!application.isActive) return unprocessable(res, 'Application is not active');
      let interviewer = existingInterviewer;
      if (!interviewer && manualName) {
        const { firstName, lastName } = splitManualName(manualName);
        interviewer = await prisma.user.upsert({
          where: { email: manualInterviewerEmail(manualName) },
          update: { firstName, lastName },
          create: {
            email: manualInterviewerEmail(manualName),
            firstName,
            lastName,
            role: ROLES.INTERVIEWER,
            accessScope: 'assigned_interviews',
            entities: [],
            isActive: false,
          },
          select: { id: true, isActive: true },
        });
      }
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
          interviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
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

// POST /interviews/:id/score
interviewsRouter.post(
  '/:id/score',
  requireRoles([ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER, ROLES.INTERVIEWER]),
  [
    body('scores').isObject(),
    body('scores.knowledge').isInt({ min: 1, max: 5 }),
    body('scores.attitude').isInt({ min: 1, max: 5 }),
    body('scores.feedback').isInt({ min: 1, max: 5 }),
    body('recommendation').notEmpty(),
    body('notes').optional().isString(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const interview = await prisma.interview.findFirst({
        where: {
          id: req.params.id,
          application: buildApplicationScopeWhere(req.user),
        },
        include: {
          application: {
            include: {
              position: {
                include: {
                  scorecardTemplate: { include: { categories: { orderBy: { order: 'asc' } } } },
                },
              },
            },
          },
          scorecard: { include: { ratings: true } },
        },
      });

      if (!interview) return notFound(res, 'Interview');
      if (req.user.role === ROLES.INTERVIEWER && interview.interviewerId !== req.user.id) {
        return badRequest(res, 'Only the assigned interviewer can score this interview');
      }

      let template = interview.application.position?.scorecardTemplate || null;
      if (!template || template.categories.length === 0) {
        template = await prisma.scorecardTemplate.findFirst({
          where: { isActive: true },
          include: { categories: { orderBy: { order: 'asc' } } },
        });
      }
      if (!template || template.categories.length === 0) {
        return unprocessable(res, 'No scorecard template is configured');
      }

      const scoreValues = [
        Number(req.body.scores.knowledge),
        Number(req.body.scores.attitude),
        Number(req.body.scores.feedback),
      ];
      const ratingData = template.categories.map((category, index) => ({
        categoryId: category.id,
        score: scoreValues[index] || scoreValues[scoreValues.length - 1],
        weight: category.weight,
      }));
      const compositeScore = computeComposite(ratingData);
      const recommendation = mapRecommendation(req.body.recommendation);
      const notes = String(req.body.notes || '').trim() || null;

      const scorecard = await prisma.$transaction(async (tx) => {
        if (interview.scorecardId || interview.scorecard?.id) {
          const scorecardId = interview.scorecardId || interview.scorecard.id;
          await tx.scorecardRating.deleteMany({ where: { scorecardId } });
          return tx.scorecard.update({
            where: { id: scorecardId },
            data: {
              templateId: template.id,
              interviewerId: interview.interviewerId,
              interviewType: interview.type,
              recommendation,
              strengthsSummary: notes,
              concernsSummary: null,
              compositeScore,
              submittedAt: new Date(),
              ratings: {
                create: ratingData.map(r => ({
                  categoryId: r.categoryId,
                  score: r.score,
                  notes: null,
                })),
              },
            },
            include: {
              interviewer: { select: { id: true, firstName: true, lastName: true } },
              ratings: true,
            },
          });
        }

        const createdScorecard = await tx.scorecard.create({
          data: {
            applicationId: interview.applicationId,
            templateId: template.id,
            interviewerId: interview.interviewerId,
            interviewType: interview.type,
            recommendation,
            strengthsSummary: notes,
            concernsSummary: null,
            compositeScore,
            submittedAt: new Date(),
            ratings: {
              create: ratingData.map(r => ({
                categoryId: r.categoryId,
                score: r.score,
                notes: null,
              })),
            },
          },
          include: {
            interviewer: { select: { id: true, firstName: true, lastName: true } },
            ratings: true,
          },
        });

        await tx.interview.update({
          where: { id: interview.id },
          data: {
            status: 'completed',
            scorecardId: createdScorecard.id,
          },
        });

        return createdScorecard;
      });

      if (interview.scorecardId || interview.scorecard?.id) {
        await prisma.interview.update({
          where: { id: interview.id },
          data: { status: 'completed' },
        });
      }

      await auditLog(req, {
        action: 'feedback_submitted',
        entity: 'scorecards',
        entityId: scorecard.id,
        after: { applicationId: interview.applicationId, recommendation, compositeScore },
      });

      return ok(res, scorecard);
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
