import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import {
  ok, created, badRequest, notFound, forbidden, unprocessable,
} from '../lib/response.js';
import {
  authenticate, scopeToUserEntities, requireRoles, ROLES,
} from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';

export const hiringRequestsRouter = Router();

hiringRequestsRouter.use(authenticate, scopeToUserEntities);

const REQUESTABLE_ROLES = [ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER];

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    badRequest(res, 'Validation failed', errors.array());
    return false;
  }
  return true;
}

function mapStatus(status) {
  return {
    pending_manager_approval: 'Pending Manager Approval',
    pending_hr_approval: 'Pending HR Approval',
    pending_admin_approval: 'Pending Admin Approval',
    approved: 'Approved',
    rejected: 'Rejected',
  }[status] || status;
}

function toFrontendRequest(item) {
  return {
    id: item.id,
    title: item.title,
    dept: item.department?.name || '',
    departmentId: item.departmentId,
    entity: item.entity,
    requestedBy: [item.requestedBy?.firstName, item.requestedBy?.lastName].filter(Boolean).join(' ') || item.requestedBy?.email || '',
    requestedById: item.requestedById,
    reason: item.reason,
    status: mapStatus(item.status),
    managerApproved: !!item.managerApproved,
    hrApproved: !!item.hrApproved,
    ceoApproved: !!item.adminApproved,
    requestDate: item.requestDate?.toISOString?.().slice(0, 10) || item.createdAt?.toISOString?.().slice(0, 10) || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function canViewRequest(reqUser, item) {
  if (reqUser.role === ROLES.ADMIN || reqUser.role === ROLES.RECRUITER) return true;
  if (reqUser.role === ROLES.HIRING_MANAGER) {
    return item.requestedById === reqUser.id || item.departmentId === reqUser.departmentId;
  }
  return false;
}

function canApproveManagerStep(reqUser, item) {
  return reqUser.role === ROLES.ADMIN || (reqUser.role === ROLES.HIRING_MANAGER && (item.requestedById === reqUser.id || item.departmentId === reqUser.departmentId));
}

function canApproveHrStep(reqUser) {
  return reqUser.role === ROLES.ADMIN || reqUser.role === ROLES.RECRUITER;
}

function canApproveAdminStep(reqUser) {
  return reqUser.role === ROLES.ADMIN || !!reqUser.canApproveRequisitions;
}

hiringRequestsRouter.get(
  '/',
  [
    query('status').optional().isString(),
    query('entity').optional().isString(),
    query('departmentId').optional().isString(),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const where = {
        isActive: true,
        ...(req.entityFilter ? { entity: { in: req.entityFilter } } : {}),
        ...(req.query.status ? { status: req.query.status } : {}),
        ...(req.query.entity ? { entity: req.query.entity } : {}),
        ...(req.query.departmentId ? { departmentId: req.query.departmentId } : {}),
      };

      const rows = await prisma.hiringRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          department: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });

      return ok(res, rows.filter(item => canViewRequest(req.user, item)).map(toFrontendRequest));
    } catch (err) {
      next(err);
    }
  }
);

hiringRequestsRouter.post(
  '/',
  requireRoles(REQUESTABLE_ROLES),
  [
    body('title').notEmpty().trim().withMessage('Role title required'),
    body('departmentId').optional().isString(),
    body('departmentName').optional().isString(),
    body('entity').isIn(['egypt', 'cyprus', 'uk', 'tunisia']).withMessage('Invalid entity'),
    body('reason').notEmpty().trim().withMessage('Business reason required'),
  ],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      let department = null;
      if (req.body.departmentId) {
        department = await prisma.department.findFirst({
          where: { id: req.body.departmentId, entity: req.body.entity, isActive: true },
        });
      }
      if (!department && req.body.departmentName) {
        department = await prisma.department.upsert({
          where: {
            name_entity: {
              name: req.body.departmentName,
              entity: req.body.entity,
            },
          },
          update: { isActive: true },
          create: {
            name: req.body.departmentName,
            entity: req.body.entity,
          },
        });
      }
      if (!department) return notFound(res, 'Department');

      const requestedByManager = req.user.role === ROLES.HIRING_MANAGER;
      const record = await prisma.hiringRequest.create({
        data: {
          title: req.body.title,
          departmentId: department.id,
          entity: req.body.entity,
          reason: req.body.reason,
          requestedById: req.user.id,
          status: requestedByManager ? 'pending_hr_approval' : 'pending_manager_approval',
          managerApproved: requestedByManager,
        },
        include: {
          department: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });

      await auditLog(req, {
        action: 'created',
        entity: 'hiring_requests',
        entityId: record.id,
        after: {
          title: record.title,
          entity: record.entity,
          status: record.status,
          departmentId: record.departmentId,
        },
      });

      return created(res, toFrontendRequest(record));
    } catch (err) {
      next(err);
    }
  }
);

hiringRequestsRouter.patch(
  '/:id/approve-step',
  [param('id').isString(), body('note').optional().isString()],
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const existing = await prisma.hiringRequest.findUnique({
        where: { id: req.params.id },
        include: {
          department: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });
      if (!existing || !existing.isActive) return notFound(res, 'Hiring request');

      if (req.entityFilter && !req.entityFilter.includes(existing.entity)) {
        return forbidden(res, 'Access denied to this entity');
      }
      if (!canViewRequest(req.user, existing)) {
        return forbidden(res, 'You do not have access to this hiring request');
      }
      if (existing.status === 'approved') {
        return unprocessable(res, 'Hiring request is already approved');
      }
      if (existing.status === 'rejected') {
        return unprocessable(res, 'Rejected hiring requests cannot be approved');
      }

      const updates = {};
      if (!existing.managerApproved) {
        if (!canApproveManagerStep(req.user, existing)) {
          return forbidden(res, 'Only the assigned hiring manager or an admin can approve this step');
        }
        updates.managerApproved = true;
        updates.status = 'pending_hr_approval';
      } else if (!existing.hrApproved) {
        if (!canApproveHrStep(req.user)) {
          return forbidden(res, 'Only HR or an admin can approve this step');
        }
        updates.hrApproved = true;
        updates.status = 'pending_admin_approval';
      } else if (!existing.adminApproved) {
        if (!canApproveAdminStep(req.user)) {
          return forbidden(res, 'Only an admin or requisition approver can approve this step');
        }
        updates.adminApproved = true;
        updates.status = 'approved';
        updates.approvedAt = new Date();
      }

      if (Object.keys(updates).length === 0) {
        return unprocessable(res, 'No approval step is currently available');
      }

      const createsApprovedRequisition = updates.status === 'approved';
      const updated = await prisma.$transaction(async (tx) => {
        const request = await tx.hiringRequest.update({
          where: { id: existing.id },
          data: updates,
          include: {
            department: { select: { id: true, name: true } },
            requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        });

        if (createsApprovedRequisition) {
          await tx.position.create({
            data: {
              title: request.title,
              departmentId: request.departmentId,
              entity: request.entity,
              seniority: 'mid',
              employmentType: 'full_time',
              currency: 'EGP',
              salaryMin: 0,
              salaryMax: 1,
              priority: 'normal',
              status: 'open',
              headcountStatus: 'approved',
              headcountApprovedAt: updates.approvedAt,
              headcountApprovedBy: req.user.name || req.user.email,
              headcountRationale: request.reason || 'Created from approved hiring request',
              openDate: updates.approvedAt,
              recruiterId: req.user.id,
              description: request.reason || '',
              requirements: [],
            },
          });
        }

        return request;
      });

      await auditLog(req, {
        action: 'approved',
        entity: 'hiring_requests',
        entityId: updated.id,
        before: {
          status: existing.status,
          managerApproved: existing.managerApproved,
          hrApproved: existing.hrApproved,
          adminApproved: existing.adminApproved,
        },
        after: {
          status: updated.status,
          managerApproved: updated.managerApproved,
          hrApproved: updated.hrApproved,
          adminApproved: updated.adminApproved,
          createdRequisition: createsApprovedRequisition,
        },
      });

      return ok(res, toFrontendRequest(updated));
    } catch (err) {
      next(err);
    }
  }
);
