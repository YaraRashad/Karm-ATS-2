// ─── Error Handler Middleware ─────────────────────────────────────────

/**
 * Global error handler — catches anything passed to next(err)
 */
export function errorHandler(err, req, res, next) {
  // Already sent — can't modify headers
  if (res.headersSent) return next(err);

  const isDev = process.env.NODE_ENV === 'development';

  // Log all errors
  console.error(`[ERROR] ${req.method} ${req.path}`, {
    message: err.message,
    code:    err.code,
    ...(isDev && { stack: err.stack }),
  });

  // Prisma-specific errors
  if (err.code === 'P2002') {
    // Unique constraint violation
    const field = err.meta?.target?.join(', ') || 'field';
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `A record with this ${field} already exists`,
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (err.code === 'P2025') {
    // Record not found
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found' },
      timestamp: new Date().toISOString(),
    });
  }

  if (err.code === 'P2003') {
    // Foreign key violation
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Referenced record does not exist' },
      timestamp: new Date().toISOString(),
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      timestamp: new Date().toISOString(),
    });
  }

  // Validation errors from express-validator (passed as err.array())
  if (err.type === 'validation') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors: err.errors,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Default 500
  const status  = err.status || err.statusCode || 500;
  const message = status === 500 && !isDev
    ? 'Internal server error'
    : err.message;

  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      ...(isDev && { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 handler — catches routes that don't exist
 */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
  });
}
