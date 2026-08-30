// ─── Offers Routes ────────────────────────────────────────────────────
// GET    /api/v1/offers
// POST   /api/v1/offers
// GET    /api/v1/offers/:id
// PATCH  /api/v1/offers/:id
// POST   /api/v1/offers/:id/submit             — draft → pending_approval
// POST   /api/v1/offers/:id/approve-step       — approve one step in chain
// POST   /api/v1/offers/:id/reject-step        — reject at a step
// PATCH  /api/v1/offers/:id/candidate-status   — draft/accepted/declined
// POST   /api/v1/offers/:id/mark-accepted
// POST   /api/v1/offers/:id/mark-declined
// POST   /api/v1/offers/:id/trigger-onboarding
// GET    /api/v1/offers/:id/letter             — rendered letter content

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import {
  ok, created, noContent, badRequest, notFound, unprocessable, paginated, forbidden,
} from '../lib/response.js';
import {
  authenticate, scopeToUserEntities,
  requireRoles, canModifyOffer,
  CAN_READ_OFFERS, CAN_APPROVE_OFFERS,
  buildApplicationScopeWhere, stripSalaryFields, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const offersRouter = Router();
offersRouter.use(authenticate, scopeToUserEntities);

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { badRequest(res, 'Validation failed', e.array()); return false; }
  return true;
}

// ── Band validation helper ────────────────────────────────────────────
async function validateSalaryBand(entity, gradeBandId, baseSalary) {
  if (!gradeBandId) return { valid: true, exception: false };

  const band = await prisma.gradeBand.findUnique({ where: { id: gradeBandId } });
  if (!band) return { valid: true, exception: false };

  const exception = baseSalary > band.salaryMax || baseSalary < band.salaryMin;
  const pctFromMax = band.salaryMax > 0
    ? ((baseSalary - band.salaryMax) / band.salaryMax * 100).toFixed(1)
    : 0;

  return {
    valid: true,
    exception,
    exceptionNote: exception
      ? baseSalary > band.salaryMax
        ? `${Math.abs(pctFromMax)}% above ${band.grade} max (${band.currency} ${band.salaryMax.toLocaleString()})`
        : `Below ${band.grade} min (${band.currency} ${band.salaryMin.toLocaleString()})`
      : null,
    band,
  };
}

// Build default approval chain steps
function buildApprovalChain(recruiterUserId, hiringManagerUserId, hrDirectorId) {
  return [
    { stepOrder: 1, role: 'Recruiter',        approverId: recruiterUserId   || null, status: 'pending' },
    { stepOrder: 2, role: 'Hiring Manager',   approverId: hiringManagerUserId || null, status: 'waiting' },
    { stepOrder: 3, role: 'HR Director',      approverId: hrDirectorId      || null, status: 'waiting' },
    { stepOrder: 4, role: 'Finance (auto)',   approverId: null,               status: 'waiting' },
  ];
}

// ── GET /offers ───────────────────────────────────────────────────────
offersRouter.get('/', requireRoles(CAN_READ_OFFERS), async (req, res, next) => {
  try {
    const {
      page = 1, pageSize = 25,
      status, entity, positionId,
      sortBy = 'createdAt', sortDir = 'desc',
    } = req.query;

    const entityWhere = req.entityFilter
      ? { position: { entity: { in: req.entityFilter } } }
      : {};

    const where = {
      AND: [
        entityWhere,
        { application: buildApplicationScopeWhere(req.user) },
      ],
      ...(status     && { status }),
      ...(positionId && { positionId }),
      ...(entity     && { position: { entity } }),
    };

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where, skip: (parseInt(page)-1) * parseInt(pageSize), take: parseInt(pageSize),
        orderBy: { [sortBy]: sortDir },
        include: {
          application: {
            include: {
              candidate: {
                select: {
                  id: true, firstName: true, lastName: true,
                  email: true, currentTitle: true, currentCompany: true,
                  noticePeriodDays: true,
                },
              },
            },
          },
          position: {
            select: {
              id: true, title: true, entity: true,
              department: { select: { name: true } },
            },
          },
          gradeBand: { select: { grade: true, salaryMin: true, salaryMax: true, currency: true } },
          approvalSteps: { orderBy: { stepOrder: 'asc' } },
          _count: { select: { notes: true } },
        },
      }),
      prisma.offer.count({ where }),
    ]);

    // Enrich with days until expiry
    const enriched = offers.map(o => ({
      ...o,
      daysUntilExpiry: o.respondByDate && o.status === 'sent'
        ? Math.ceil((new Date(o.respondByDate) - Date.now()) / 86400000)
        : null,
    }));

    return paginated(res, stripSalaryFields(req.user, enriched), {
      page: parseInt(page), pageSize: parseInt(pageSize), total,
    });
  } catch (err) { next(err); }
});

// ── POST /offers ──────────────────────────────────────────────────────
offersRouter.post(
  '/',
  canModifyOffer,
  [
    body('applicationId').notEmpty(),
    body('positionId').notEmpty(),
    body('currency').notEmpty(),
    body('baseSalary').isInt({ min: 1 }),
    body('bonusTargetPct').isInt({ min: 0, max: 100 }).optional(),
    body('startDate').isISO8601().optional(),
    body('respondByDate').isISO8601().optional(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const {
        applicationId, positionId, gradeBandId,
        currency, baseSalary, bonusTargetPct = 0,
        signingBonus = 0, annualLeaveDays = 21,
        startDate, respondByDate,
      } = req.body;

      // Verify application and position
      const [application, position] = await Promise.all([
        prisma.application.findUnique({
          where: { id: applicationId },
          include: {
            position: {
              include: {
                hiringManager: { include: { user: { select: { id: true } } } },
              },
            },
          },
        }),
        prisma.position.findUnique({ where: { id: positionId } }),
      ]);

      if (!application) return notFound(res, 'Application');
      if (!position)    return notFound(res, 'Position');

      // Check no active offer already exists
      const existingOffer = await prisma.offer.findFirst({
        where: {
          applicationId,
          status: { notIn: ['declined','expired','withdrawn'] },
        },
      });
      if (existingOffer) {
        return unprocessable(res, 'An active offer already exists for this application');
      }

      // Band validation
      const bandCheck = await validateSalaryBand(position.entity, gradeBandId, baseSalary);

      // Find HR Director for approval chain
      const adminApprover = await prisma.user.findFirst({
        where: { role: 'admin', canApproveOffers: true, entities: { has: position.entity }, isActive: true },
      });

      const hiringManagerUserId = application.position.hiringManager?.user?.id || null;

      const offer = await prisma.offer.create({
        data: {
          applicationId,
          positionId,
          gradeBandId,
          currency,
          baseSalary,
          bonusTargetPct,
          signingBonus,
          annualLeaveDays,
          startDate:      startDate     ? new Date(startDate)     : null,
          respondByDate:  respondByDate ? new Date(respondByDate) : null,
          status:         'draft',
          bandException:  bandCheck.exception,
          bandExceptionNote: bandCheck.exceptionNote,
          approvalSteps: {
            create: buildApprovalChain(req.user.id, hiringManagerUserId, adminApprover?.id),
          },
          history: {
            create: [{
              event:     'Offer created',
              actorName: req.user.name,
              actorId:   req.user.id,
            }],
          },
        },
        include: {
          approvalSteps: { orderBy: { stepOrder: 'asc' } },
          history:       { orderBy: { createdAt: 'asc' } },
          gradeBand:     true,
        },
      });

      await auditLog(req, {
        action: 'offer_created',
        entity: 'offers',
        entityId: offer.id,
        after: { applicationId, positionId, baseSalary, currency },
      });

      return created(res, stripSalaryFields(req.user, {
        ...offer,
        bandValidation: bandCheck,
        daysUntilExpiry: respondByDate
          ? Math.ceil((new Date(respondByDate) - Date.now()) / 86400000)
          : null,
      }));
    } catch (err) { next(err); }
  }
);

// ── GET /offers/:id ───────────────────────────────────────────────────
offersRouter.get('/:id', requireRoles(CAN_READ_OFFERS), async (req, res, next) => {
  try {
    const offer = await prisma.offer.findFirst({
      where: { id: req.params.id, application: buildApplicationScopeWhere(req.user) },
      include: {
        application: {
          include: {
            candidate: true,
            scorecards: {
              where: { submittedAt: { not: null } },
              select: { compositeScore: true, recommendation: true },
            },
          },
        },
        position: {
          include: { department: { select: { name: true } } },
        },
        gradeBand:    true,
        approvalSteps: {
          include: {
            approver: { select: { id: true, firstName: true, lastName: true, role: true } },
          },
          orderBy: { stepOrder: 'asc' },
        },
        notes: {
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!offer) return notFound(res, 'Offer');

    const scores = offer.application.scorecards
      .filter(s => s.compositeScore)
      .map(s => parseFloat(s.compositeScore));

    return ok(res, stripSalaryFields(req.user, {
      ...offer,
      averageScore: scores.length
        ? +(scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(2)
        : null,
      daysUntilExpiry: offer.respondByDate && offer.status === 'sent'
        ? Math.ceil((new Date(offer.respondByDate) - Date.now()) / 86400000)
        : null,
    }));
  } catch (err) { next(err); }
});

// ── POST /offers/:id/submit ───────────────────────────────────────────
offersRouter.post('/:id/submit', canModifyOffer, async (req, res, next) => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!offer)                        return notFound(res, 'Offer');
    if (offer.status !== 'draft')      return unprocessable(res, 'Only draft offers can be submitted');

    // Activate first step
    const [updated] = await prisma.$transaction([
      prisma.offer.update({
        where: { id: req.params.id },
        data:  { status: 'pending_approval' },
      }),
      prisma.approvalStep.update({
        where: { id: offer.approvalSteps[0].id },
        data:  { status: 'pending' },
      }),
      prisma.offerHistory.create({
        data: {
          offerId:   req.params.id,
          event:     'Submitted for approval',
          actorName: req.user.name,
          actorId:   req.user.id,
        },
      }),
    ]);

    return ok(res, updated);
  } catch (err) { next(err); }
});

// ── POST /offers/:id/approve-step ─────────────────────────────────────
offersRouter.post(
  '/:id/approve-step',
  requireRoles(CAN_READ_OFFERS),
  [body('note').isString().optional()],
  async (req, res, next) => {
    try {
      const offer = await prisma.offer.findUnique({
        where: { id: req.params.id },
        include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
      });
      if (!offer) return notFound(res, 'Offer');
      if (!['pending_approval'].includes(offer.status)) {
        return unprocessable(res, 'Offer is not pending approval');
      }

      const pendingStep = offer.approvalSteps.find(s => s.status === 'pending');
      if (!pendingStep) return unprocessable(res, 'No step pending approval');

      // Check the user is the assigned approver or has explicit approval rights.
      const canApprove = req.user.role === ROLES.ADMIN || req.user.canApproveOffers
        || pendingStep.approverId === req.user.id;
      if (!canApprove) {
        return forbidden(res, 'You are not the assigned approver for this step');
      }

      const nextStep = offer.approvalSteps.find(s => s.stepOrder === pendingStep.stepOrder + 1);
      const isLastStep = !nextStep;

      const ops = [
        prisma.approvalStep.update({
          where: { id: pendingStep.id },
          data: {
            status:  'approved',
            note:    req.body.note || 'Approved',
            actedAt: new Date(),
          },
        }),
        prisma.offerHistory.create({
          data: {
            offerId:   req.params.id,
            event:     `${pendingStep.role} approved`,
            actorName: req.user.name,
            actorId:   req.user.id,
            metadata:  { note: req.body.note },
          },
        }),
      ];

      if (isLastStep) {
        // All approved — auto-send offer
        ops.push(
          prisma.offer.update({
            where: { id: req.params.id },
            data:  { status: 'sent', sentAt: new Date() },
          }),
          prisma.offerHistory.create({
            data: {
              offerId:   req.params.id,
              event:     'All approvals complete — offer sent to candidate',
              actorName: 'System',
            },
          })
        );
      } else {
        // Activate next step
        ops.push(
          prisma.approvalStep.update({
            where: { id: nextStep.id },
            data:  { status: 'pending' },
          })
        );

        // Auto-approve Finance step (step 4) if band is OK
        if (nextStep.stepOrder === 4 && !offer.bandException) {
          ops.push(
            prisma.approvalStep.update({
              where: { id: nextStep.id },
              data:  {
                status:  'approved',
                note:    'Salary within approved grade band — auto-approved',
                actedAt: new Date(),
              },
            }),
            prisma.offer.update({
              where: { id: req.params.id },
              data:  { status: 'sent', sentAt: new Date() },
            }),
            prisma.offerHistory.create({
              data: {
                offerId:   req.params.id,
                event:     'Finance auto-check passed — offer sent to candidate',
                actorName: 'System',
              },
            })
          );
        }
      }

      await prisma.$transaction(ops);
      await auditLog(req, {
        action: 'approved',
        entity: 'offers',
        entityId: req.params.id,
        after: { step: pendingStep.role, note: req.body.note || 'Approved' },
      });

      // Re-fetch updated offer
      const updated = await prisma.offer.findUnique({
        where: { id: req.params.id },
        include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── POST /offers/:id/reject-step ──────────────────────────────────────
offersRouter.post(
  '/:id/reject-step',
  requireRoles(CAN_READ_OFFERS),
  [body('reason').notEmpty().withMessage('Rejection reason required')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const offer = await prisma.offer.findUnique({
        where: { id: req.params.id },
        include: { approvalSteps: true },
      });
      if (!offer) return notFound(res, 'Offer');

      const pendingStep = offer.approvalSteps.find(s => s.status === 'pending');
      if (!pendingStep) return unprocessable(res, 'No step is currently pending');

      const canReject = req.user.role === ROLES.ADMIN || req.user.canApproveOffers
        || pendingStep.approverId === req.user.id;
      if (!canReject) {
        return forbidden(res, 'You are not the assigned approver for this step');
      }

      await prisma.$transaction([
        prisma.offer.update({
          where: { id: req.params.id },
          data:  { status: 'draft' },
        }),
        prisma.approvalStep.update({
          where: { id: pendingStep.id },
          data:  { status: 'rejected', note: req.body.reason, actedAt: new Date() },
        }),
        // Reset all subsequent steps
        prisma.approvalStep.updateMany({
          where: { offerId: req.params.id, stepOrder: { gt: pendingStep.stepOrder } },
          data:  { status: 'waiting', note: null, actedAt: null },
        }),
        prisma.offerHistory.create({
          data: {
            offerId:   req.params.id,
            event:     `${pendingStep.role} rejected offer`,
            actorName: req.user.name,
            actorId:   req.user.id,
            metadata:  { reason: req.body.reason },
          },
        }),
      ]);

      await auditLog(req, {
        action: 'rejected',
        entity: 'offers',
        entityId: req.params.id,
        after: { reason: req.body.reason, step: pendingStep.role },
      });

      return ok(res, { message: 'Offer returned to draft — submitter has been notified' });
    } catch (err) { next(err); }
  }
);

// ── PATCH /offers/:id/candidate-status ───────────────────────────────
offersRouter.patch(
  '/:id/candidate-status',
  canModifyOffer,
  [
    body('status').isIn(['draft', 'accepted', 'declined']).withMessage('Status must be draft, accepted, or declined'),
    body('reason').optional().isString(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { status, reason } = req.body;
      const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
      if (!offer) return notFound(res, 'Offer');

      const now = new Date();
      const offerData = status === 'accepted'
        ? { status: 'accepted', acceptedAt: now, declinedAt: null, declineReason: null, declineNotes: null }
        : status === 'declined'
          ? { status: 'declined', declinedAt: now, declineReason: reason || 'Candidate declined', declineNotes: null }
          : { status: 'draft', acceptedAt: null, declinedAt: null, declineReason: null, declineNotes: null };

      const applicationData = status === 'accepted'
        ? { stage: 'hired', displayStage: 'Hired', stageEnteredAt: now, isActive: true, disqualifyReason: null }
        : status === 'declined'
          ? { stage: 'rejected', displayStage: 'Rejected', stageEnteredAt: now, isActive: false, disqualifyReason: `Offer declined: ${reason || 'Candidate declined'}` }
          : { stage: 'offer', displayStage: 'Offer', stageEnteredAt: now, isActive: true, disqualifyReason: null };

      const [updated] = await prisma.$transaction([
        prisma.offer.update({
          where: { id: req.params.id },
          data: offerData,
        }),
        prisma.application.update({
          where: { id: offer.applicationId },
          data: applicationData,
        }),
        prisma.offerHistory.create({
          data: {
            offerId: req.params.id,
            event: `Candidate offer status set to ${status}`,
            actorName: req.user.name,
            actorId: req.user.id,
            metadata: { status, reason },
          },
        }),
      ]);

      await auditLog(req, {
        action: 'updated',
        entity: 'offers',
        entityId: req.params.id,
        before: { status: offer.status },
        after: { status, reason },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  },
);

// ── POST /offers/:id/mark-accepted ────────────────────────────────────
offersRouter.post('/:id/mark-accepted', canModifyOffer, async (req, res, next) => {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) return notFound(res, 'Offer');
    if (!['draft', 'approved', 'sent'].includes(offer.status)) {
      return unprocessable(res, 'Only draft, approved, or sent offers can be accepted');
    }

    const [updated] = await prisma.$transaction([
      prisma.offer.update({
        where: { id: req.params.id },
        data:  { status: 'accepted', acceptedAt: new Date() },
      }),
      // Move application to hired
      prisma.application.update({
        where: { id: offer.applicationId },
        data:  { stage: 'hired', displayStage: 'Hired', stageEnteredAt: new Date(), isActive: true, disqualifyReason: null },
      }),
      prisma.offerHistory.create({
        data: {
          offerId:   req.params.id,
          event:     'Offer accepted by candidate',
          actorName: req.user.name,
          actorId:   req.user.id,
        },
      }),
    ]);

    return ok(res, {
      ...updated,
      message: 'Offer accepted — application moved to Hired. Trigger onboarding when ready.',
    });
  } catch (err) { next(err); }
});

// ── POST /offers/:id/mark-declined ────────────────────────────────────
offersRouter.post(
  '/:id/mark-declined',
  canModifyOffer,
  [body('reason').notEmpty().withMessage('Decline reason required')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
      if (!offer) return notFound(res, 'Offer');
      if (!['draft','approved','sent','accepted'].includes(offer.status)) {
        return unprocessable(res, 'Only draft, approved, sent, or accepted offers can be declined');
      }

      const [updated] = await prisma.$transaction([
        prisma.offer.update({
          where: { id: req.params.id },
          data: {
            status:       'declined',
            declinedAt:   new Date(),
            declineReason: req.body.reason,
            declineNotes:  req.body.notes || null,
          },
        }),
        prisma.application.update({
          where: { id: offer.applicationId },
          data:  { stage: 'rejected', displayStage: 'Rejected', stageEnteredAt: new Date(), isActive: false,
                   disqualifyReason: `Offer declined: ${req.body.reason}` },
        }),
        prisma.offerHistory.create({
          data: {
            offerId:   req.params.id,
            event:     `Offer declined — ${req.body.reason}`,
            actorName: req.user.name,
            actorId:   req.user.id,
            metadata:  { reason: req.body.reason, notes: req.body.notes },
          },
        }),
      ]);

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── POST /offers/:id/trigger-onboarding ──────────────────────────────
offersRouter.post('/:id/trigger-onboarding', canModifyOffer, async (req, res, next) => {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer)                          return notFound(res, 'Offer');
    if (offer.status !== 'accepted')     return unprocessable(res, 'Offer must be accepted first');
    if (offer.onboardingTriggered)       return unprocessable(res, 'Onboarding already triggered');

    const updated = await prisma.offer.update({
      where: { id: req.params.id },
      data:  { onboardingTriggered: true },
    });

    await prisma.offerHistory.create({
      data: {
        offerId:   req.params.id,
        event:     'Onboarding checklist triggered — IT setup and buddy assignment initiated',
        actorName: req.user.name,
        actorId:   req.user.id,
      },
    });

    return ok(res, {
      ...updated,
      message: 'Onboarding triggered — IT, HR, and the hiring manager have been notified.',
      onboardingTasks: [
        'IT equipment request sent',
        'System access provisioning initiated',
        'Welcome email scheduled for day before start date',
        'Buddy assignment pending HR action',
        '30/60/90 day plan template sent to hiring manager',
      ],
    });
  } catch (err) { next(err); }
});
