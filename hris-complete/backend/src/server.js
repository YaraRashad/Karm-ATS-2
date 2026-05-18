// ─── HRIS Platform API — Server Entry Point ──────────────────────────
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';

import { authRouter }         from './routes/auth.js';
import { positionsRouter }    from './routes/positions.js';
import { hiringRequestsRouter } from './routes/hiringRequests.js';
import { candidatesRouter }   from './routes/candidates.js';
import { applicationsRouter } from './routes/applications.js';
import { interviewsRouter }   from './routes/interviews.js';
import { scorecardsRouter, templatesRouter } from './routes/scorecards.js';
import { offersRouter }       from './routes/offers.js';
import { analyticsRouter }    from './routes/analytics.js';
import { filesRouter }        from './routes/files.js';
import { auditRouter }        from './routes/audit.js';
import { usersRouter }        from './routes/users.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger }      from './middleware/requestLogger.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ───────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
    },
  },
}));

// ── CORS ─────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-ID'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
});
app.use('/api/', limiter);

// Auth endpoints get stricter rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts — try again in 15 minutes.' },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/refresh', authLimiter);
app.use('/api/v1/auth/microsoft', authLimiter);
app.use('/api/v1/auth/qa-login', authLimiter);

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
app.use(requestLogger);

// ── Health check (no auth required) ──────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'HRIS Platform API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ────────────────────────────────────────────────────────
// Version prefix: /api/v1
const v1 = '/api/v1';

app.use(`${v1}/auth`,         authRouter);
app.use(`${v1}/hiring-requests`, hiringRequestsRouter);
app.use(`${v1}/positions`,    positionsRouter);
app.use(`${v1}/candidates`,   candidatesRouter);
app.use(`${v1}/applications`, applicationsRouter);
app.use(`${v1}/interviews`,   interviewsRouter);
app.use(`${v1}/scorecards`,   scorecardsRouter);
app.use(`${v1}/offers`,       offersRouter);
app.use(`${v1}/files`,        filesRouter);
app.use(`${v1}/audit`,        auditRouter);
app.use(`${v1}/users`,        usersRouter);
app.use(`${v1}/templates`,    templatesRouter);
app.use(`${v1}/analytics`,    analyticsRouter);

// ── 404 & error handlers ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │   HRIS Platform API                     │
  │   http://localhost:${PORT}                  │
  │   Environment: ${(process.env.NODE_ENV || 'development').padEnd(16)}       │
  └─────────────────────────────────────────┘
  `);
});

export default app;
