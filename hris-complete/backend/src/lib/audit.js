import { prisma } from './prisma.js';

export async function auditLog(req, { action, entity, entityId, before = null, after = null }) {
  return prisma.auditLog.create({
    data: {
      userId: req.user?.id || null,
      action,
      entity,
      entityId,
      before,
      after,
      ipAddress: req.ip,
      userAgent: req.get?.('user-agent') || null,
    },
  });
}
