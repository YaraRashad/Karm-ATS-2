import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, scopeToUserEntities, requireRoles, ROLES, buildApplicationScopeWhere } from '../middleware/auth.js';
import { ok, badRequest, notFound } from '../lib/response.js';
import { isEmailConfigured, sendEmail } from '../lib/email.js';
import { letterPreview, confirmLetter } from '../lib/thankYouLetters.js';
import { auditLog } from '../lib/audit.js';

export const thankYouRouter = Router();
thankYouRouter.use(authenticate, scopeToUserEntities, requireRoles([ROLES.ADMIN, ROLES.RECRUITER]));
const include = { candidate: { select: { firstName: true, lastName: true, email: true } }, position: { select: { title: true, entity: true } } };
const scope = req => ({ AND: [buildApplicationScopeWhere(req.user), ...(req.entityFilter ? [{ position: { entity: { in: req.entityFilter } } }] : [])] });
thankYouRouter.get('/', async (req, res, next) => {
  try {
    const applications = await prisma.application.findMany({
      where: { ...scope(req), thankYouStatus: { not: null }, OR: [{ stage: 'rejected' }, { thankYouStatus: { in: ['sent', 'sending', 'needs_review'] } }] },
      include, orderBy: { thankYouQueuedAt: 'desc' },
    });
    return ok(res, { emailConfigured: isEmailConfigured(), letters: applications.map(a => ({
      id: a.id, candidateName: [a.candidate.firstName, a.candidate.lastName].filter(Boolean).join(' '), position: a.position.title,
      status: a.thankYouStatus, queuedAt: a.thankYouQueuedAt, sentAt: a.thankYouSentAt,
      preview: a.thankYouStatus === 'pending' ? letterPreview(a) : { to: a.thankYouRecipient, subject: a.thankYouSubject, text: a.thankYouBody },
    })) });
  } catch (error) { next(error); }
});
thankYouRouter.post('/:id/confirm', requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const application = await prisma.application.findFirst({ where: { id: req.params.id, ...scope(req) }, include });
    if (!application) return notFound(res, 'Application');
    if (!isEmailConfigured()) return badRequest(res, 'Email service is not configured. No email was sent.');
    let result;
    try { result = await confirmLetter({ prisma, sendEmail, application, token: req.body.token, adminId: req.user.id }); }
    catch (error) { return badRequest(res, error.message); }
    await auditLog(req, { action: 'thank_you_letter_confirmed', entity: 'applications', entityId: application.id, before: { status: application.thankYouStatus }, after: { status: result.status, recipient: application.candidate.email, approvedBy: req.user.id } });
    return ok(res, result);
  } catch (error) { next(error); }
});
