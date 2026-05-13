// ─── JWT Auth Utilities ───────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in environment');
}

/**
 * Generate access token (short-lived: 15 min)
 * Payload includes role and entity access for middleware checks
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub:      user.id,
      email:    user.email,
      role:     user.role,
      departmentId: user.departmentId || null,
      accessScope: user.accessScope,
      canViewSalary: !!user.canViewSalary,
      canApproveOffers: !!user.canApproveOffers,
      canApproveRequisitions: !!user.canApproveRequisitions,
      entities: user.entities,
      name:     `${user.firstName} ${user.lastName}`,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXP, algorithm: 'HS256' }
  );
}

/**
 * Generate refresh token (long-lived: 7 days)
 * Opaque — store hash in DB, return raw token to client
 */
export function generateRefreshToken() {
  const raw   = crypto.randomBytes(64).toString('hex');
  const hash  = crypto.createHash('sha256').update(raw).digest('hex');
  const exp   = new Date();
  exp.setDate(exp.getDate() + 7);
  return { raw, hash, expiresAt: exp };
}

/**
 * Verify access token — throws on invalid/expired
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/**
 * Hash a refresh token for storage comparison
 */
export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
