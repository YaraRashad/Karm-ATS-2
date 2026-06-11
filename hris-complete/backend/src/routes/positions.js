// ─── Positions Routes ─────────────────────────────────────────────────
// GET    /api/v1/positions
// POST   /api/v1/positions
// GET    /api/v1/positions/:id
// PATCH  /api/v1/positions/:id
// DELETE /api/v1/positions/:id
// POST   /api/v1/positions/:id/approve-headcount
// POST   /api/v1/positions/:id/reject-headcount
// GET    /api/v1/positions/:id/pipeline          — candidate counts per stage
// PATCH  /api/v1/positions/:id/status            — open, close, hold

import { Router }  from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { prisma }  from '../lib/prisma.js';
import {
  ok, created, noContent, badRequest, notFound,
  forbidden, unprocessable, paginated,
} from '../lib/response.js';
import {
  authenticate, scopeToUserEntities,
  requireRoles, CAN_MANAGE_POSITIONS, CAN_APPROVE_HC,
  buildPositionScopeWhere, stripSalaryFields, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const positionsRouter = Router();

// All routes require auth
positionsRouter.use(authenticate, scopeToUserEntities);

// ── Validation ────────────────────────────────────────────────────────
const positionBody = [
  body('title').notEmpty().trim().withMessage('Title required'),
  body('departmentId').optional().isString(),
  body('departmentName').optional().isString(),
  body('entity').isIn(['egypt','cyprus','uk','tunisia']).withMessage('Invalid entity'),
  body('seniority').isIn(['junior','mid','senior','lead','director','vp']),
  body('employmentType').isIn(['full_time','part_time','contract','internship']).optional(),
  body('currency').notEmpty().withMessage('Currency required'),
  body('salaryMin').isInt({ min: 0 }).withMessage('Salary min must be positive integer'),
  body('salaryMax').isInt({ min: 0 }).withMessage('Salary max must be positive integer'),
  body('priority').isIn(['low','normal','high','urgent']).optional(),
  body('requirements').isArray().optional(),
  body('description').isString().optional(),
];

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { badRequest(res, 'Validation failed', e.array()); return false; }
  return true;
}

// ── GET /positions ────────────────────────────────────────────────────
positionsRouter.get('/', async (req, res, next) => {
  try {
    const {
      page = 1, pageSize = 25,
      entity, department, status, priority,
      search, hiringManagerId, recruiterId,
      sortBy = 'createdAt', sortDir = 'desc',
      includeArchivedClosed,
    } = req.query;

    const skip  = (parseInt(page) - 1) * parseInt(pageSize);
    const take  = parseInt(pageSize);

    // Entity scoping
    const entityFilter = req.entityFilter
      ? { entity: { in: req.entityFilter } }
      : {};

    const activeVisibility = includeArchivedClosed === 'true'
      ? { OR: [{ isActive: true }, { status: 'closed' }] }
      : { isActive: true };

    const where = {
      ...activeVisibility,
      ...entityFilter,
      ...buildPositionScopeWhere(req.user),
      ...(entity        && { entity }),
      ...(department    && { department: { name: { contains: department, mode: 'insensitive' } } }),
      ...(status        && { status }),
      ...(priority      && { priority }),
      ...(hiringManagerId && { hiringManagerId }),
      ...(recruiterId   && { recruiterId }),
      ...(search        && {
        OR: [
          { title:       { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [positions, total] = await Promise.all([
      prisma.position.findMany({
        where, skip, take,
        orderBy: { [sortBy]: sortDir },
        include: {
          department:       { select: { id: true, name: true } },
          gradeBand:        { select: { grade: true, salaryMin: true, salaryMax: true } },
          hiringManager:    { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          recruiter:        { select: { id: true, firstName: true, lastName: true, email: true } },
          scorecardTemplate:{ select: { id: true, name: true } },
          _count:           { select: { applications: true } },
        },
      }),
      prisma.position.count({ where }),
    ]);

    // Compute days open for each position
    const enriched = positions.map(p => ({
      ...p,
      daysOpen:     p.openDate ? Math.floor((Date.now() - new Date(p.openDate)) / 86400000) : 0,
      candidateCount: p._count.applications,
    }));

    return paginated(res, stripSalaryFields(req.user, enriched), {
      page: parseInt(page), pageSize: parseInt(pageSize), total,
    });
  } catch (err) { next(err); }
});

// ── POST /positions ───────────────────────────────────────────────────
positionsRouter.post(
  '/',
  requireRoles(CAN_MANAGE_POSITIONS),
  positionBody,
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const {
        title, departmentId, departmentName, entity, seniority, employmentType,
        gradeBandId, currency, salaryMin, salaryMax, priority,
        hiringManagerId, scorecardTemplateId, description,
        requirements, targetCloseDate, headcountRationale,
      } = req.body;

      if (salaryMin >= salaryMax) {
        return badRequest(res, 'Salary min must be less than salary max');
      }

      // Verify department exists and belongs to entity
      let dept = departmentId
        ? await prisma.department.findFirst({ where: { id: departmentId, entity, isActive: true } })
        : null;
      if (!dept && departmentName) {
        dept = await prisma.department.upsert({
          where: { name_entity: { name: departmentName, entity } },
          update: { isActive: true },
          create: { name: departmentName, entity },
        });
      }
      if (!dept) return notFound(res, 'Department');

      const position = await prisma.position.create({
        data: {
          title, departmentId: dept.id, entity,
          seniority: seniority || 'mid',
          employmentType: employmentType || 'full_time',
          gradeBandId,
          currency, salaryMin, salaryMax,
          priority: priority || 'normal',
          status: 'draft',
          headcountStatus: 'pending',
          hiringManagerId,
          recruiterId: req.user.id,
          scorecardTemplateId,
          description,
          requirements: requirements || [],
          targetCloseDate: targetCloseDate ? new Date(targetCloseDate) : null,
          headcountRationale,
        },
        include: {
          department: { select: { id: true, name: true } },
          recruiter:  { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return created(res, position);
    } catch (err) { next(err); }
  }
);

// ── GET /positions/:id ────────────────────────────────────────────────
positionsRouter.get('/:id', async (req, res, next) => {
  try {
    const position = await prisma.position.findFirst({
      where: { id: req.params.id, ...buildPositionScopeWhere(req.user) },
      include: {
        department:        { select: { id: true, name: true } },
        gradeBand:         true,
        hiringManager:     { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        recruiter:         { select: { id: true, firstName: true, lastName: true, email: true } },
        scorecardTemplate: { include: { categories: { orderBy: { order: 'asc' } } } },
        _count:            { select: { applications: true } },
        applications: {
          where:  { isActive: true },
          select: { stage: true },
        },
      },
    });

    if (!position) return notFound(res, 'Position');

    // Check entity access
    if (req.entityFilter && !req.entityFilter.includes(position.entity)) {
      return forbidden(res, 'Access denied to this entity');
    }

    // Aggregate pipeline counts
    const stageCounts = position.applications.reduce((acc, a) => {
      acc[a.stage] = (acc[a.stage] || 0) + 1;
      return acc;
    }, {});

    return ok(res, stripSalaryFields(req.user, {
      ...position,
      daysOpen: position.openDate
        ? Math.floor((Date.now() - new Date(position.openDate)) / 86400000)
        : 0,
      stageCounts,
      totalCandidates: position._count.applications,
    }));
  } catch (err) { next(err); }
});

// ── PATCH /positions/:id ──────────────────────────────────────────────
positionsRouter.patch(
  '/:id',
  requireRoles(CAN_MANAGE_POSITIONS),
  async (req, res, next) => {
    try {
      const existing = await prisma.position.findUnique({ where: { id: req.params.id } });
      if (!existing) return notFound(res, 'Position');

      // Can't edit a closed position
      if (existing.status === 'closed') {
        return unprocessable(res, 'Cannot edit a closed position');
      }

      const updates = {};
      const nextEntity = req.body.entity || existing.entity;

      if (req.body.departmentName && !req.body.departmentId) {
        const department = await prisma.department.upsert({
          where: {
            name_entity: {
              name: req.body.departmentName,
              entity: nextEntity,
            },
          },
          update: { isActive: true },
          create: {
            name: req.body.departmentName,
            entity: nextEntity,
          },
        });
        updates.departmentId = department.id;
      }

      const allowed = [
        'title', 'description', 'requirements', 'priority',
        'salaryMin', 'salaryMax', 'targetCloseDate',
        'hiringManagerId', 'recruiterId', 'scorecardTemplateId',
        'headcountRationale', 'entity', 'seniority', 'employmentType',
        'departmentId',
      ];

      allowed.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });

      if (updates.targetCloseDate) {
        updates.targetCloseDate = new Date(updates.targetCloseDate);
      }

      const salaryMin = updates.salaryMin ?? existing.salaryMin;
      const salaryMax = updates.salaryMax ?? existing.salaryMax;
      if (salaryMin >= salaryMax) {
        return unprocessable(res, 'Salary max must be greater than salary min');
      }

      const updated = await prisma.position.update({
        where: { id: req.params.id },
        data:  updates,
        include: {
          department:    { select: { id: true, name: true } },
          recruiter:     { select: { id: true, firstName: true, lastName: true, email: true } },
          hiringManager: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } } },
        },
      });

      await auditLog(req, {
        action: 'updated',
        entity: 'positions',
        entityId: existing.id,
        before: existing,
        after: updated,
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── PATCH /positions/:id/recruiter ───────────────────────────────────
positionsRouter.patch(
  '/:id/recruiter',
  requireRoles(CAN_MANAGE_POSITIONS),
  [body('recruiterId').notEmpty().isString().withMessage('Recruiter is required')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const existing = await prisma.position.findUnique({
        where: { id: req.params.id },
        include: { recruiter: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      if (!existing) return notFound(res, 'Position');

      const recruiter = await prisma.user.findFirst({
        where: {
          id: req.body.recruiterId,
          isActive: true,
          role: { in: [ROLES.ADMIN, ROLES.RECRUITER] },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (!recruiter) return unprocessable(res, 'Selected user must be an active Admin or Recruiter');

      const updated = await prisma.position.update({
        where: { id: req.params.id },
        data: { recruiterId: recruiter.id },
        include: {
          department: { select: { id: true, name: true } },
          recruiter:  { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await auditLog(req, {
        action: 'updated',
        entity: 'positions',
        entityId: existing.id,
        before: { recruiterId: existing.recruiterId, recruiter: existing.recruiter },
        after: { recruiterId: recruiter.id, recruiter },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── POST /positions/:id/approve-headcount ─────────────────────────────
positionsRouter.post(
  '/:id/approve-headcount',
  requireRoles(CAN_APPROVE_HC),
  [body('note').isString().optional()],
  async (req, res, next) => {
    try {
      const position = await prisma.position.findUnique({ where: { id: req.params.id } });
      if (!position) return notFound(res, 'Position');

      if (position.headcountStatus === 'approved') {
        return unprocessable(res, 'Headcount already approved');
      }

      const updated = await prisma.position.update({
        where: { id: req.params.id },
        data: {
          headcountStatus:     'approved',
          headcountApprovedAt: new Date(),
          headcountApprovedBy: req.user.id,
          status:              'open',
          openDate:            new Date(),
        },
      });

      await auditLog(req, {
        action: 'approved',
        entity: 'positions',
        entityId: position.id,
        after: { headcountStatus: 'approved', approvedBy: req.user.name },
      });

      return ok(res, {
        ...updated,
        message: 'Headcount approved — position is now open for recruitment',
      });
    } catch (err) { next(err); }
  }
);

// ── POST /positions/:id/reject-headcount ──────────────────────────────
positionsRouter.post(
  '/:id/reject-headcount',
  requireRoles(CAN_APPROVE_HC),
  [body('reason').notEmpty().withMessage('Rejection reason required')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const position = await prisma.position.findUnique({ where: { id: req.params.id } });
      if (!position) return notFound(res, 'Position');

      const updated = await prisma.position.update({
        where: { id: req.params.id },
        data:  { headcountStatus: 'rejected', status: 'draft' },
      });

      await auditLog(req, {
        action: 'rejected',
        entity: 'positions',
        entityId: position.id,
        after: { headcountStatus: 'rejected', reason: req.body.reason },
      });

      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── PATCH /positions/:id/status ───────────────────────────────────────
positionsRouter.patch(
  '/:id/status',
  requireRoles(CAN_MANAGE_POSITIONS),
  [body('status').isIn(['draft','open','on_hold','closed']).withMessage('Invalid status')],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { status } = req.body;
      const updates = { status };
      if (status === 'closed') {
        updates.closedDate = new Date();
        updates.isActive   = true;
      } else {
        updates.isActive = true;
        updates.closedDate = null;
        if (status === 'open') updates.openDate = new Date();
      }
      const updated = await prisma.position.update({
        where: { id: req.params.id },
        data:  updates,
      });
      return ok(res, updated);
    } catch (err) { next(err); }
  }
);

// ── GET /positions/:id/pipeline ───────────────────────────────────────
positionsRouter.get('/:id/pipeline', async (req, res, next) => {
  try {
    const position = await prisma.position.findFirst({
      where: { id: req.params.id, ...buildPositionScopeWhere(req.user) },
      select: { id: true, title: true, entity: true },
    });
    if (!position) return notFound(res, 'Position');

    const applications = await prisma.application.findMany({
      where:   { positionId: req.params.id, isActive: true },
      include: {
        candidate: {
          select: {
            id: true, firstName: true, lastName: true,
            currentTitle: true, currentCompany: true,
            email: true, source: true, tags: true,
          },
        },
        scorecards: {
          where:  { submittedAt: { not: null } },
          select: { compositeScore: true, recommendation: true },
        },
        interviews: {
          where:   { status: 'scheduled' },
          orderBy: { scheduledAt: 'asc' },
          take:    1,
          select:  { scheduledAt: true, type: true, interviewerName: true },
        },
      },
    });

    // Group by stage
    const stages = ['applied','screening','interview','assessment','offer','hired','rejected'];
    const pipeline = stages.reduce((acc, stage) => {
      const stageApps = applications.filter(a => a.stage === stage);
      acc[stage] = stageApps.map(a => {
        const scores = a.scorecards.map(s => parseFloat(s.compositeScore)).filter(Boolean);
        const avgScore = scores.length
          ? +(scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(2)
          : null;
        const daysInProcess = Math.floor(
          (Date.now() - new Date(a.appliedAt)) / 86400000
        );
        const daysInStage = Math.floor(
          (Date.now() - new Date(a.stageEnteredAt)) / 86400000
        );
        return {
          applicationId: a.id,
          candidateId:   a.candidate.id,
          name:          `${a.candidate.firstName} ${a.candidate.lastName}`,
          title:         a.candidate.currentTitle,
          company:       a.candidate.currentCompany,
          email:         a.candidate.email,
          source:        a.candidate.source,
          tags:          a.candidate.tags,
          avgScore,
          scorecardCount: a.scorecards.length,
          upcomingInterview: a.interviews[0] || null,
          daysInProcess,
          daysInStage,
          appliedAt:     a.appliedAt,
        };
      });
      return acc;
    }, {});

    return ok(res, { position, pipeline });
  } catch (err) { next(err); }
});

// ── DELETE /positions/:id ─────────────────────────────────────────────
positionsRouter.delete(
  '/:id',
  requireRoles([ROLES.ADMIN]),
  async (req, res, next) => {
    try {
      const position = await prisma.position.findUnique({ where: { id: req.params.id } });
      if (!position) return notFound(res, 'Position');

      const [activeAppCount, historicalAppCount, offerCount] = await Promise.all([
        prisma.application.count({
          where: { positionId: req.params.id, isActive: true },
        }),
        prisma.application.count({
          where: { positionId: req.params.id },
        }),
        prisma.offer.count({
          where: { positionId: req.params.id },
        }),
      ]);

      if (activeAppCount > 0) {
        return unprocessable(res,
          `Cannot delete — position has ${activeAppCount} active application(s). Close the position instead.`
        );
      }

      if (historicalAppCount > 0 || offerCount > 0) {
        return unprocessable(res,
          'Cannot delete — position has candidate or offer history. Close the position instead so history stays reportable.'
        );
      }

      await prisma.position.delete({
        where: { id: req.params.id },
      });

      return noContent(res);
    } catch (err) { next(err); }
  }
);
