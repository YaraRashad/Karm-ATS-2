import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { ok, created, badRequest, notFound } from '../lib/response.js';
import { authenticate, requireRoles, ROLES } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const usersRouter = Router();

usersRouter.use(authenticate, requireRoles(ROLES.ADMIN));

const roleValues = ['admin', 'recruiter', 'hiring_manager', 'interviewer'];
const scopeValues = ['all_data', 'recruitment_data', 'assigned_jobs', 'assigned_interviews'];
const entityValues = ['egypt', 'cyprus', 'uk', 'tunisia'];

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    badRequest(res, 'Validation failed', errors.array());
    return false;
  }
  return true;
}

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  departmentId: true,
  accessScope: true,
  canViewSalary: true,
  canApproveOffers: true,
  canApproveRequisitions: true,
  entities: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, entity: true } },
};

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
      select: userSelect,
    });
    return ok(res, users);
  } catch (err) {
    next(err);
  }
});

usersRouter.post(
  '/',
  [
    body('email').isEmail().normalizeEmail(),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('role').isIn(roleValues),
    body('departmentId').optional({ nullable: true }).isString(),
    body('accessScope').optional().isIn(scopeValues),
    body('entities').optional().isArray(),
    body('entities.*').optional().isIn(entityValues),
    body('canViewSalary').optional().isBoolean(),
    body('canApproveOffers').optional().isBoolean(),
    body('canApproveRequisitions').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const user = await prisma.user.create({
        data: {
          email: req.body.email,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          role: req.body.role,
          departmentId: req.body.departmentId || null,
          accessScope: req.body.accessScope || 'assigned_jobs',
          entities: req.body.entities || ['egypt'],
          canViewSalary: !!req.body.canViewSalary,
          canApproveOffers: !!req.body.canApproveOffers,
          canApproveRequisitions: !!req.body.canApproveRequisitions,
          isActive: req.body.isActive !== false,
        },
        select: userSelect,
      });
      await auditLog(req, {
        action: 'created',
        entity: 'users',
        entityId: user.id,
        after: { email: user.email, role: user.role },
      });
      return created(res, user);
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.patch(
  '/:id',
  [
    param('id').notEmpty(),
    body('role').optional().isIn(roleValues),
    body('departmentId').optional({ nullable: true }).isString(),
    body('accessScope').optional().isIn(scopeValues),
    body('entities').optional().isArray(),
    body('entities.*').optional().isIn(entityValues),
    body('canViewSalary').optional().isBoolean(),
    body('canApproveOffers').optional().isBoolean(),
    body('canApproveRequisitions').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
      if (!before) return notFound(res, 'User');

      const allowed = [
        'role',
        'departmentId',
        'accessScope',
        'entities',
        'canViewSalary',
        'canApproveOffers',
        'canApproveRequisitions',
        'isActive',
      ];
      const data = {};
      allowed.forEach(field => {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      });

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data,
        select: userSelect,
      });

      await auditLog(req, {
        action: 'role_changed',
        entity: 'users',
        entityId: user.id,
        before: {
          role: before.role,
          accessScope: before.accessScope,
          canViewSalary: before.canViewSalary,
          canApproveOffers: before.canApproveOffers,
          canApproveRequisitions: before.canApproveRequisitions,
          isActive: before.isActive,
        },
        after: {
          role: user.role,
          accessScope: user.accessScope,
          canViewSalary: user.canViewSalary,
          canApproveOffers: user.canApproveOffers,
          canApproveRequisitions: user.canApproveRequisitions,
          isActive: user.isActive,
        },
      });
      return ok(res, user);
    } catch (err) {
      next(err);
    }
  }
);
