// ─── Request Logger Middleware ────────────────────────────────────────
import crypto from 'crypto';

/**
 * Attaches a unique X-Request-ID to every request.
 * Logs structured request info including user context once auth runs.
 */
export function requestLogger(req, res, next) {
  // Attach request ID (use incoming one if trusted proxy sends it)
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);

  // Log completion
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR'
                : res.statusCode >= 400 ? 'WARN'
                : 'INFO';

    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify({
        level,
        requestId: req.requestId,
        method:    req.method,
        path:      req.path,
        status:    res.statusCode,
        duration:  `${duration}ms`,
        userId:    req.user?.id || null,
        userRole:  req.user?.role || null,
        ip:        req.ip,
      }));
    }
  });

  next();
}
