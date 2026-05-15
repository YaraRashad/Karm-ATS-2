// ─── Auth Routes ─────────────────────────────────────────────────────
// POST /api/v1/auth/login
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout
// GET  /api/v1/auth/me
// POST /api/v1/auth/change-password

import { Router }    from 'express';
import bcrypt        from 'bcryptjs';
import crypto        from 'crypto';
import { prisma }    from '../lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from '../lib/jwt.js';
import {
  ok, created, unauthorized, badRequest, notFound, serverError,
} from '../lib/response.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { verifyMicrosoftIdToken } from '../lib/microsoftIdentity.js';
import { auditLog } from '../lib/audit.js';

export const authRouter = Router();

// ── Validation chains ─────────────────────────────────────────────────
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty(),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/[A-Z]/).withMessage('Must contain uppercase')
    .matches(/[0-9]/).withMessage('Must contain number')
    .withMessage('Password must be 8+ chars with uppercase and number'),
];

// ── Helper ────────────────────────────────────────────────────────────
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    badRequest(res, 'Validation failed', errors.array());
    return false;
  }
  return true;
}

const userSelect = {
  id: true, email: true, passwordHash: true,
  azureAdObjectId: true, microsoftTenantId: true,
  firstName: true, lastName: true,
  role: true, departmentId: true, accessScope: true,
  canViewSalary: true, canApproveOffers: true, canApproveRequisitions: true,
  entities: true, isActive: true,
};

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role,
    departmentId: user.departmentId,
    accessScope: user.accessScope,
    canViewSalary: user.canViewSalary,
    canApproveOffers: user.canApproveOffers,
    canApproveRequisitions: user.canApproveRequisitions,
    entities: user.entities,
  };
}

async function issueSession(user, req, res, method = user.azureAdObjectId ? 'microsoft' : 'password') {
  const accessToken = generateAccessToken(user);
  const { raw, hash, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: { token: hash, userId: user.id, expiresAt },
  });
  await prisma.user.update({
    where: { id: user.id },
    data:  { lastLoginAt: new Date() },
  });
  await auditLog({ ...req, user: { id: user.id }, get: req.get.bind(req) }, {
    action: 'login',
    entity: 'users',
    entityId: user.id,
    after: { method },
  });

  return ok(res, {
    accessToken,
    refreshToken: raw,
    expiresIn: 15 * 60,
    user: publicUser(user),
  });
}

function safeEquals(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function qaUserNameParts() {
  const name = (process.env.QA_TEST_USER_NAME || 'ATS QA').trim();
  const [firstName, ...rest] = name.split(/\s+/);
  return {
    firstName: firstName || 'ATS',
    lastName: rest.join(' ') || 'QA',
  };
}

function qaUserEmail() {
  return (process.env.QA_TEST_USER_EMAIL || 'ats.qa@karmsolar.com').trim().toLowerCase();
}

function isDedicatedQaEmail(email) {
  return /(^|[._+-])(qa|test|testing|playwright)([._+-]|@)/i.test(email);
}

// ── POST /login ───────────────────────────────────────────────────────
authRouter.post('/login', loginValidation, async (req, res, next) => {
  if (!validate(req, res)) return;

  try {
    if (process.env.AUTH_PROVIDER === 'microsoft' || process.env.NODE_ENV === 'production') {
      return badRequest(res, 'Password login is disabled. Use Microsoft 365 sign-in.');
    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });

    // Constant-time comparison even for non-existent users
    const dummyHash = '$2a$12$dummyhashtopreventtimingattacks.fakepasswordhash';
    const hashToCheck = user?.passwordHash || dummyHash;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid || !user.isActive) {
      return unauthorized(res, 'Invalid email or password');
    }

    return issueSession(user, req, res);
  } catch (err) {
    next(err);
  }
});

// ── POST /microsoft ──────────────────────────────────────────────────
authRouter.post('/microsoft', [body('idToken').notEmpty()], async (req, res, next) => {
  if (!validate(req, res)) return;
  try {
    const identity = await verifyMicrosoftIdToken(req.body.idToken);
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identity.email },
          ...(identity.oid ? [{ azureAdObjectId: identity.oid }] : []),
        ],
      },
      select: userSelect,
    });

    if (!user && process.env.AUTH_AUTO_PROVISION === 'true') {
      user = await prisma.user.create({
        data: {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          role: 'interviewer',
          entities: ['egypt'],
          accessScope: 'assigned_interviews',
          azureAdObjectId: identity.oid,
          microsoftTenantId: identity.tenantId,
        },
        select: userSelect,
      });
    }

    if (!user || !user.isActive) {
      return unauthorized(res, 'Your Microsoft account is valid but is not active in Karm ATS. Ask Admin to add you.');
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        azureAdObjectId: user.azureAdObjectId || identity.oid,
        microsoftTenantId: identity.tenantId,
      },
      select: userSelect,
    });

    return issueSession(user, req, res);
  } catch (err) {
    return unauthorized(res, err.message || 'Microsoft 365 sign-in failed');
  }
});

// ── POST /qa-login ───────────────────────────────────────────────────
// Temporary test-only login for Playwright. Hidden unless explicitly enabled
// in Azure App Service settings with QA_TEST_LOGIN_ENABLED=true.
authRouter.post('/qa-login', async (req, res, next) => {
  if (process.env.QA_TEST_LOGIN_ENABLED !== 'true') {
    return notFound(res, 'QA login');
  }

  const expectedSecret = process.env.QA_TEST_LOGIN_SECRET;
  const providedSecret = req.get('x-qa-login-secret') || req.body?.secret;
  if (!expectedSecret || !providedSecret || !safeEquals(providedSecret, expectedSecret)) {
    return unauthorized(res, 'QA login is not available');
  }

  const email = qaUserEmail();
  if (!isDedicatedQaEmail(email)) {
    return badRequest(res, 'QA_TEST_USER_EMAIL must be a dedicated qa/test account, not a real production user');
  }

  try {
    const { firstName, lastName } = qaUserNameParts();
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        firstName,
        lastName,
        role: 'recruiter',
        departmentId: null,
        accessScope: 'recruitment_data',
        canViewSalary: false,
        canApproveOffers: false,
        canApproveRequisitions: false,
        entities: ['egypt', 'cyprus', 'uk', 'tunisia'],
        isActive: true,
      },
      create: {
        email,
        firstName,
        lastName,
        role: 'recruiter',
        accessScope: 'recruitment_data',
        canViewSalary: false,
        canApproveOffers: false,
        canApproveRequisitions: false,
        entities: ['egypt', 'cyprus', 'uk', 'tunisia'],
        isActive: true,
      },
      select: userSelect,
    });

    return issueSession(user, req, res, 'qa_test');
  } catch (err) {
    next(err);
  }
});

// ── POST /refresh ─────────────────────────────────────────────────────
authRouter.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return unauthorized(res, 'Refresh token required');

  try {
    const hash  = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: hash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        // Expired — clean up
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      return unauthorized(res, 'Refresh token invalid or expired — please log in again');
    }

    if (!stored.user.isActive) {
      return unauthorized(res, 'Account deactivated');
    }

    // Rotate: delete old, issue new
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const newAccess = generateAccessToken(stored.user);
    const { raw, hash: newHash, expiresAt } = generateRefreshToken();

    await prisma.refreshToken.create({
      data: { token: newHash, userId: stored.user.id, expiresAt },
    });

    return ok(res, {
      accessToken:  newAccess,
      refreshToken: raw,
      expiresIn:    15 * 60,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /logout ──────────────────────────────────────────────────────
authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const hash = hashToken(refreshToken);
      await prisma.refreshToken.deleteMany({ where: { token: hash } });
    }
    return ok(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// ── GET /me ───────────────────────────────────────────────────────────
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, departmentId: true, accessScope: true,
        canViewSalary: true, canApproveOffers: true, canApproveRequisitions: true,
        entities: true, lastLoginAt: true, createdAt: true,
        department: { select: { id: true, name: true, entity: true } },
        employee: {
          select: {
            id: true, employeeNumber: true, positionTitle: true,
            grade: true, entity: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) return unauthorized(res, 'User not found');
    return ok(res, { ...user, fullName: `${user.firstName} ${user.lastName}` });
  } catch (err) {
    next(err);
  }
});

// ── POST /change-password ─────────────────────────────────────────────
authRouter.post(
  '/change-password',
  authenticate,
  changePasswordValidation,
  async (req, res, next) => {
    if (!validate(req, res)) return;
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return badRequest(res, 'Current password is incorrect');

      const hash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: req.user.id },
        data:  { passwordHash: hash },
      });

      // Revoke all refresh tokens — force re-login on other devices
      await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });

      return ok(res, { message: 'Password changed — please log in again on other devices' });
    } catch (err) {
      next(err);
    }
  }
);
