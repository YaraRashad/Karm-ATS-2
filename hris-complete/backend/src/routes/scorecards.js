// ─── Scorecards Routes ────────────────────────────────────────────────
// GET  /api/v1/scorecards                 — list (pending + completed)
// POST /api/v1/scorecards                 — create/submit
// GET  /api/v1/scorecards/:id
// POST /api/v1/scorecards/:id/submit      — lock & compute composite
// GET  /api/v1/scorecards/templates       — list templates
// POST /api/v1/scorecards/templates       — create template
// GET  /api/v1/scorecards/templates/:id
// PUT  /api/v1/scorecards/templates/:id

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import {
  ok, created, badRequest, notFound, unprocessable, forbidden, paginated,
} from '../lib/response.js';
import {
  authenticate, scopeToUserEntities,
  requireRoles, CAN_WRITE_CANDIDATES, buildApplicationScopeWhere, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const scorecardsRouter = Router();
scorecardsRouter.use(authenticate, scopeToUserEntities);

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { badRequest(res, 'Validation failed', e.array()); return false; }
  return true;
}

// ── Compute weighted composite score ──────────────────────────────────
function computeComposite(ratings) {
  // ratings: [{ score: number, weight: number }]
  const totalWeight = ratings.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return null;

  const weightedSum = ratings.reduce((sum, r) => sum + (r.score * (r.weight / 100)), 0);
  const normalised  = weightedSum / (totalWeight / 100);
  return Math.round(normalised * 100) / 100;
}

// ── GET /scorecards ───────────────────────────────────────────────────
scorecardsRouter.get('/', requireRoles([ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER, ROLES.INTERVIEWER]), async (req, res, next) => {
  try {
    const {
      page = 1, pageSize = 25,
      applicationId, interviewerId, submitted, positionId,
    } = req.query;

    const where = {
      AND: [
        { application: buildApplicationScopeWhere(req.user) },
        ...(positionId ? [{ application: { positionId } }] : []),
      ],
      ...(applicationId  && { applicationId }),
      ...(interviewerId  && req.user.role !== ROLES.INTERVIEWER && { interviewerId }),
      ...(req.user.role === ROLES.INTERVIEWER && { interviewerId: req.user.id }),
      ...(submitted === 'true'  && { submittedAt: { not: null } }),
      ...(submitted === 'false' && { submittedAt: null }),
    };

    const [scorecards, total] = await Promise.all([
      prisma.scorecard.findMany({
        where, skip: (parseInt(page)-1) * parseInt(pageSize), take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          interviewer: { select: { id: true, firstName: true, lastName: true } },
          template:    { select: { id: true, name: true } },
          application: {
            include: {
              candidate: { select: { id: true, firstName: true, lastName: true } },
              position:  { select: { id: true, title: true, entity: true } },
            },
          },
          ratings: {
            include: { category: { select: { name: true, weight: true } } },
          },
        },
      }),
      prisma.scorecard.count({ where }),
    ]);

    return paginated(res, scorecards, {
      page: parseInt(page), pageSize: parseInt(pageSize), total,
    });
  } catch (err) { next(err); }
});

// ── POST /scorecards ──────────────────────────────────────────────────
scorecardsRouter.post(
  '/',
  requireRoles([ROLES.ADMIN, ROLES.RECRUITER, ROLES.INTERVIEWER]),
  [
    body('applicationId').notEmpty(),
    body('templateId').notEmpty(),
    body('interviewType').isIn(['phone_screen','technical','behavioral','panel','final','case_study']),
    body('ratings').isArray({ min: 1 }).withMessage('At least one rating required'),
    body('ratings.*.categoryId').notEmpty(),
    body('ratings.*.score').isInt({ min: 1, max: 5 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const {
        applicationId, templateId, interviewType,
        ratings, recommendation, strengthsSummary, concernsSummary,
        submitNow = false,
      } = req.body;

      // Verify application + template
      const [application, template] = await Promise.all([
        prisma.application.findFirst({
          where: { id: applicationId, ...buildApplicationScopeWhere(req.user) },
          select: { id: true, isActive: true },
        }),
        prisma.scorecardTemplate.findUnique({
          where: { id: templateId },
          include: { categories: true },
        }),
      ]);

      if (!application) return notFound(res, 'Application');
      if (!application.isActive) return unprocessable(res, 'Application is not active');
      if (!template) return notFound(res, 'Scorecard template');

      // Validate category IDs belong to template
      const validCatIds = new Set(template.categories.map(c => c.id));
      const invalidCats = ratings.filter(r => !validCatIds.has(r.categoryId));
      if (invalidCats.length > 0) {
        return badRequest(res, `Invalid category IDs: ${invalidCats.map(r => r.categoryId).join(', ')}`);
      }

      // Check weights sum to 100
      const totalWeight = template.categories.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight !== 100) {
        return unprocessable(res, `Template weights must sum to 100 (currently ${totalWeight})`);
      }

      // Compute composite if submitting
      let compositeScore = null;
      if (submitNow) {
        const ratingData = ratings.map(r => {
          const cat = template.categories.find(c => c.id === r.categoryId);
          return { score: r.score, weight: cat.weight };
        });
        compositeScore = computeComposite(ratingData);
      }

      const scorecard = await prisma.scorecard.create({
        data: {
          applicationId,
          templateId,
          interviewerId:    req.user.id,
          interviewType,
          recommendation:   submitNow ? recommendation : null,
          strengthsSummary: submitNow ? strengthsSummary : null,
          concernsSummary:  submitNow ? concernsSummary  : null,
          compositeScore,
          submittedAt:      submitNow ? new Date() : null,
          ratings: {
            create: ratings.map(r => ({
              categoryId: r.categoryId,
              score:      r.score,
              notes:      r.notes || null,
            })),
          },
        },
        include: {
          ratings: {
            include: { category: { select: { name: true, weight: true, colorHex: true } } },
          },
          template:    { select: { id: true, name: true } },
          interviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (submitNow) {
        await auditLog(req, {
          action: 'feedback_submitted',
          entity: 'scorecards',
          entityId: scorecard.id,
          after: { applicationId, recommendation, compositeScore },
        });
      }

      return created(res, scorecard);
    } catch (err) { next(err); }
  }
);

// ── GET /scorecards/:id ───────────────────────────────────────────────
scorecardsRouter.get('/:id', requireRoles([ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER, ROLES.INTERVIEWER]), async (req, res, next) => {
  try {
    const scorecard = await prisma.scorecard.findUnique({
      where: { id: req.params.id },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            position:  { select: { id: true, title: true, entity: true } },
          },
        },
        template:    { include: { categories: { orderBy: { order: 'asc' } } } },
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        ratings: {
          include: {
            category: {
              select: { id: true, name: true, weight: true, colorHex: true, levels: true },
            },
          },
          orderBy: { category: { order: 'asc' } },
        },
      },
    });

    if (!scorecard) return notFound(res, 'Scorecard');
    if (req.user.role === ROLES.INTERVIEWER && scorecard.interviewerId !== req.user.id) {
      return forbidden(res, 'You can only view your assigned scorecards');
    }
    return ok(res, scorecard);
  } catch (err) { next(err); }
});

// ── POST /scorecards/:id/submit ───────────────────────────────────────
// Locks the scorecard, computes composite, records timestamp
scorecardsRouter.post(
  '/:id/submit',
  requireRoles([ROLES.ADMIN, ROLES.RECRUITER, ROLES.INTERVIEWER]),
  [
    body('recommendation').isIn(['strong_yes','yes','neutral','no','strong_no']).withMessage('Invalid recommendation'),
    body('strengthsSummary').isString().optional(),
    body('concernsSummary').isString().optional(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { recommendation, strengthsSummary, concernsSummary } = req.body;

      const scorecard = await prisma.scorecard.findUnique({
        where: { id: req.params.id },
        include: {
          ratings: {
            include: { category: { select: { weight: true } } },
          },
          interviewer: { select: { id: true } },
        },
      });

      if (!scorecard) return notFound(res, 'Scorecard');

      if (scorecard.submittedAt) {
        return unprocessable(res, 'Scorecard already submitted — cannot be modified');
      }

      // Only the assigned interviewer or admin can submit
      if (scorecard.interviewerId !== req.user.id &&
          req.user.role !== ROLES.ADMIN) {
        return forbidden(res, 'Only the assigned interviewer can submit this scorecard');
      }

      if (scorecard.ratings.length === 0) {
        return unprocessable(res, 'Cannot submit — no ratings recorded');
      }

      // Compute composite
      const composite = computeComposite(
        scorecard.ratings.map(r => ({ score: r.score, weight: r.category.weight }))
      );

      const updated = await prisma.scorecard.update({
        where: { id: req.params.id },
        data: {
          recommendation,
          strengthsSummary,
          concernsSummary,
          compositeScore: composite,
          submittedAt:    new Date(),
        },
        include: {
          ratings: {
            include: { category: { select: { name: true, weight: true, colorHex: true } } },
          },
          interviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await auditLog(req, {
        action: 'feedback_submitted',
        entity: 'scorecards',
        entityId: req.params.id,
        after: { recommendation, compositeScore: composite },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── Templates ─────────────────────────────────────────────────────────

// GET /scorecards/templates
export const templatesRouter = Router();
templatesRouter.use(authenticate);

templatesRouter.get('/', async (req, res, next) => {
  try {
    const templates = await prisma.scorecardTemplate.findMany({
      where: { isActive: true },
      include: { categories: { orderBy: { order: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return ok(res, templates);
  } catch (err) { next(err); }
});

templatesRouter.post(
  '/',
  requireRoles([ROLES.ADMIN, ROLES.RECRUITER]),
  [
    body('name').notEmpty().trim(),
    body('categories').isArray({ min: 2 }).withMessage('Need at least 2 categories'),
    body('categories.*.name').notEmpty(),
    body('categories.*.weight').isInt({ min: 5, max: 80 }),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { name, icon, description, appliesTo, categories } = req.body;

      const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight !== 100) {
        return badRequest(res, `Category weights must sum to exactly 100 (currently ${totalWeight})`);
      }

      const template = await prisma.scorecardTemplate.create({
        data: {
          name, icon, description,
          appliesTo: appliesTo || [],
          categories: {
            create: categories.map((c, i) => ({
              name:        c.name,
              description: c.description || null,
              weight:      c.weight,
              order:       i,
              colorHex:    c.colorHex || '#3a5a8a',
              levels:      c.levels || ['Poor','Below expectations','Adequate','Strong','Exceptional'],
            })),
          },
        },
        include: { categories: { orderBy: { order: 'asc' } } },
      });

      return created(res, template);
    } catch (err) { next(err); }
  }
);

templatesRouter.get('/:id', async (req, res, next) => {
  try {
    const template = await prisma.scorecardTemplate.findUnique({
      where: { id: req.params.id },
      include: { categories: { orderBy: { order: 'asc' } } },
    });
    if (!template) return notFound(res, 'Template');
    return ok(res, template);
  } catch (err) { next(err); }
});

templatesRouter.put(
  '/:id',
  requireRoles([ROLES.ADMIN, ROLES.RECRUITER]),
  [
    body('name').notEmpty().optional(),
    body('categories').isArray({ min: 2 }).optional(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { name, icon, description, appliesTo, categories } = req.body;

      if (categories) {
        const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
        if (totalWeight !== 100) {
          return badRequest(res, `Weights must sum to 100 (currently ${totalWeight})`);
        }

        // Replace all categories atomically
        await prisma.$transaction([
          prisma.scorecardTemplateCategory.deleteMany({
            where: { templateId: req.params.id },
          }),
          prisma.scorecardTemplate.update({
            where: { id: req.params.id },
            data: {
              ...(name        && { name }),
              ...(icon        && { icon }),
              ...(description && { description }),
              ...(appliesTo   && { appliesTo }),
              categories: {
                create: categories.map((c, i) => ({
                  name:        c.name,
                  description: c.description,
                  weight:      c.weight,
                  order:       i,
                  colorHex:    c.colorHex || '#3a5a8a',
                  levels:      c.levels || ['Poor','Below expectations','Adequate','Strong','Exceptional'],
                })),
              },
            },
          }),
        ]);
      }

      const updated = await prisma.scorecardTemplate.findUnique({
        where: { id: req.params.id },
        include: { categories: { orderBy: { order: 'asc' } } },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);
