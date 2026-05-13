// ─── Auth & RBAC Middleware ───────────────────────────────────────────
import { verifyAccessToken } from '../lib/jwt.js';
import { unauthorized, forbidden } from '../lib/response.js';

/**
 * authenticate — verifies JWT, attaches user to req
 * All protected routes use this first.
 */
export function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return unauthorized(res, 'Missing or malformed Authorization header');
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id:       payload.sub,
      email:    payload.email,
      role:     payload.role,
      departmentId: payload.departmentId || null,
      accessScope: payload.accessScope,
      canViewSalary: !!payload.canViewSalary,
      canApproveOffers: !!payload.canApproveOffers,
      canApproveRequisitions: !!payload.canApproveRequisitions,
      entities: payload.entities || [],
      name:     payload.name,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Access token expired — please refresh');
    }
    return unauthorized(res, 'Invalid access token');
  }
}

/**
 * requireRoles — role-based access control
 * Usage: requireRoles([ROLES.ADMIN, ROLES.RECRUITER])
 *
 * Supported ATS roles:
 *   admin, recruiter, hiring_manager, interviewer
 */
export function requireRoles(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!allowed.includes(req.user.role)) {
      return forbidden(res,
        `Role '${req.user.role}' cannot access this resource. Required: ${allowed.join(' | ')}`
      );
    }
    next();
  };
}

/**
 * requireEntity — ensures the requested entity is in the user's allowed list
 * Usage: requireEntity('entity') where req.params.entity or req.query.entity is the target
 *
 * admin can access all entities
 */
export function requireEntity(req, res, next) {
  const { role, entities } = req.user;

  // These roles can access any entity
  if (role === 'admin') return next();

  const requestedEntity =
    req.params.entity   ||
    req.query.entity    ||
    req.body?.entity;

  if (!requestedEntity) return next(); // no entity filter — list endpoints handle this

  if (!entities.includes(requestedEntity)) {
    return forbidden(res,
      `You do not have access to entity '${requestedEntity}'`
    );
  }
  next();
}

/**
 * scopeToUserEntities — adds entity filter to queries
 * Attaches req.entityFilter for use in route handlers
 * admin sees all; others see their entities only
 */
export function scopeToUserEntities(req, res, next) {
  const { role, entities } = req.user;

  if (role === 'admin') {
    req.entityFilter = null; // no filter
  } else {
    req.entityFilter = entities; // ['egypt', 'cyprus'] etc
  }
  next();
}

/**
 * canModifyOffer — specific check for offer approval chain
 * Approver must match the current pending step's assigned role
 */
export function canModifyOffer(req, res, next) {
  // Actual step ownership validation happens in the route handler
  // This middleware ensures the user can create/edit operational offer records.
  const allowed = [ROLES.ADMIN, ROLES.RECRUITER];
  if (!allowed.includes(req.user.role)) {
    return forbidden(res, 'Only Admin or Recruiter can modify offer records');
  }
  next();
}

// Role constants for convenience
export const ROLES = {
  ADMIN:          'admin',
  RECRUITER:      'recruiter',
  HIRING_MANAGER: 'hiring_manager',
  INTERVIEWER:    'interviewer',
};

// Pre-built role groups for common access patterns
export const CAN_READ_CANDIDATES   = [ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER, ROLES.INTERVIEWER];
export const CAN_WRITE_CANDIDATES  = [ROLES.ADMIN, ROLES.RECRUITER];
export const CAN_MANAGE_POSITIONS  = [ROLES.ADMIN, ROLES.RECRUITER];
export const CAN_APPROVE_HC        = [ROLES.ADMIN, ROLES.HIRING_MANAGER];
export const CAN_READ_OFFERS       = [ROLES.ADMIN, ROLES.RECRUITER, ROLES.HIRING_MANAGER];
export const CAN_APPROVE_OFFERS    = [ROLES.ADMIN, ROLES.HIRING_MANAGER];
export const CAN_READ_ANALYTICS    = [ROLES.ADMIN, ROLES.RECRUITER];

export function requirePermission(permission, message = 'Insufficient permissions') {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role === ROLES.ADMIN || req.user[permission]) return next();
    return forbidden(res, message);
  };
}

export function canViewSalary(req, res, next) {
  if (req.user.role === ROLES.ADMIN || req.user.canViewSalary) return next();
  return forbidden(res, 'Salary and offer details are restricted for this user');
}

export function buildPositionScopeWhere(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.RECRUITER) {
    return user.accessScope === 'all_data' || user.accessScope === 'recruitment_data'
      ? {}
      : { recruiterId: user.id };
  }
  if (user.role === ROLES.HIRING_MANAGER) {
    return {
      OR: [
        { hiringManager: { userId: user.id } },
        ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
      ],
    };
  }
  return {
    applications: {
      some: {
        interviews: { some: { interviewerId: user.id } },
      },
    },
  };
}

export function buildApplicationScopeWhere(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.RECRUITER) {
    return user.accessScope === 'all_data' || user.accessScope === 'recruitment_data'
      ? {}
      : { position: { recruiterId: user.id } };
  }
  if (user.role === ROLES.HIRING_MANAGER) {
    return {
      position: {
        OR: [
          { hiringManager: { userId: user.id } },
          ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
      },
    };
  }
  return { interviews: { some: { interviewerId: user.id } } };
}

export function stripSalaryFields(user, value) {
  if (user.role === ROLES.ADMIN || user.canViewSalary) return value;
  const scrub = (item) => {
    if (!item || typeof item !== 'object') return item;
    const clone = Array.isArray(item) ? item.map(scrub) : { ...item };
    for (const key of ['salaryMin', 'salaryMax', 'baseSalary', 'signingBonus', 'bonusTargetPct', 'salaryExpectation', 'salaryCurrency']) {
      if (key in clone) clone[key] = null;
    }
    if (clone.gradeBand) clone.gradeBand = scrub(clone.gradeBand);
    if (clone.position) clone.position = scrub(clone.position);
    if (clone.offers) clone.offers = scrub(clone.offers);
    return clone;
  };
  return scrub(value);
}
