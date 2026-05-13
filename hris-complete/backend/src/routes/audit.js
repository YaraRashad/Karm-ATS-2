import { Router } from 'express';
import { query } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { authenticate, requireRoles, ROLES } from '../middleware/auth.js';

export const auditRouter = Router();

auditRouter.use(authenticate, requireRoles(ROLES.ADMIN));

auditRouter.get(
  '/',
  [
    query('pageSize').optional().isInt({ min: 1, max: 500 }),
    query('entity').optional().isString(),
    query('userId').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const take = parseInt(req.query.pageSize || '200', 10);
      const logs = await prisma.auditLog.findMany({
        where: {
          ...(req.query.entity && { entity: req.query.entity }),
          ...(req.query.userId && { userId: req.query.userId }),
        },
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });
      return ok(res, logs);
    } catch (err) {
      next(err);
    }
  }
);
