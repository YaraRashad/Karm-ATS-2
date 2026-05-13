// ─── API Response Helpers ─────────────────────────────────────────────
// All responses follow the same envelope shape:
// { success, data?, error?, meta?, timestamp }

/**
 * 200 OK — data response
 */
export function ok(res, data, meta = null) {
  return res.status(200).json({
    success: true,
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * 201 Created
 */
export function created(res, data) {
  return res.status(201).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 204 No Content
 */
export function noContent(res) {
  return res.status(204).send();
}

/**
 * 400 Bad Request — validation errors
 */
export function badRequest(res, message, errors = null) {
  return res.status(400).json({
    success: false,
    error: { code: 'BAD_REQUEST', message, ...(errors && { errors }) },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 401 Unauthorized
 */
export function unauthorized(res, message = 'Authentication required') {
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 403 Forbidden
 */
export function forbidden(res, message = 'Insufficient permissions') {
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 Not Found
 */
export function notFound(res, resource = 'Resource') {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `${resource} not found` },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 409 Conflict
 */
export function conflict(res, message) {
  return res.status(409).json({
    success: false,
    error: { code: 'CONFLICT', message },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 422 Unprocessable Entity — business rule violation
 */
export function unprocessable(res, message, details = null) {
  return res.status(422).json({
    success: false,
    error: { code: 'UNPROCESSABLE', message, ...(details && { details }) },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 500 Internal Server Error
 */
export function serverError(res, message = 'Internal server error') {
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Paginated list response with meta
 */
export function paginated(res, data, { page, pageSize, total }) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrev: page > 1,
    },
    timestamp: new Date().toISOString(),
  });
}
