// ─── Analytics Routes ─────────────────────────────────────────────────
// GET /api/v1/analytics/pipeline       — funnel metrics
// GET /api/v1/analytics/offers         — offer acceptance, band compliance
// GET /api/v1/analytics/scorecards     — score distributions, pending
// GET /api/v1/analytics/headcount      — headcount by entity/dept
// GET /api/v1/analytics/time-to-hire   — avg days across stages

import { Router }  from 'express';
import { prisma }  from '../lib/prisma.js';
import { ok }      from '../lib/response.js';
import {
  authenticate, scopeToUserEntities,
  requireRoles, CAN_READ_ANALYTICS,
} from '../middleware/auth.js';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, scopeToUserEntities, requireRoles(CAN_READ_ANALYTICS));

// ── GET /analytics/pipeline ───────────────────────────────────────────
analyticsRouter.get('/pipeline', async (req, res, next) => {
  try {
    const { entity, positionId, fromDate, toDate } = req.query;

    const baseWhere = {
      isActive: true,
      ...(positionId && { positionId }),
      ...(entity     && { position: { entity } }),
      ...(req.entityFilter && { position: { entity: { in: req.entityFilter } } }),
      ...(fromDate   && { appliedAt: { gte: new Date(fromDate) } }),
      ...(toDate     && { appliedAt: { lte: new Date(toDate) } }),
    };

    const stages = ['applied','screening','interview','assessment','offer','hired','rejected'];

    // Count per stage
    const stageCounts = await prisma.$transaction(
      stages.map(stage =>
        prisma.application.count({ where: { ...baseWhere, stage } })
      )
    );

    const byStage = Object.fromEntries(stages.map((s, i) => [s, stageCounts[i]]));
    const total   = Object.values(byStage).reduce((a, b) => a + b, 0);

    // Source breakdown (active only, exclude rejected)
    const sourceGroups = await prisma.application.groupBy({
      by:    ['candidateId'],
      where: { ...baseWhere, stage: { not: 'rejected' } },
      _count: true,
    });

    const sourceBreakdown = await prisma.candidate.groupBy({
      by: ['source'],
      where: {
        id: { in: sourceGroups.map(s => s.candidateId) },
      },
      _count: { source: true },
    });

    // Conversion rates (stage to stage)
    const conversions = stages.slice(0, -1).map((stage, i) => {
      const from = byStage[stage] || 0;
      const to   = byStage[stages[i + 1]] || 0;
      return {
        from: stage,
        to:   stages[i + 1],
        rate: from > 0 ? Math.round((to / from) * 100) : 0,
      };
    });

    // New this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newThisWeek = await prisma.application.count({
      where: { ...baseWhere, appliedAt: { gte: weekAgo } },
    });

    return ok(res, {
      total,
      byStage,
      bySource: sourceBreakdown.reduce((acc, s) => {
        acc[s.source] = s._count.source;
        return acc;
      }, {}),
      conversions,
      newThisWeek,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /analytics/offers ─────────────────────────────────────────────
analyticsRouter.get('/offers', async (req, res, next) => {
  try {
    const { entity } = req.query;

    const entityWhere = entity
      ? { position: { entity } }
      : req.entityFilter
        ? { position: { entity: { in: req.entityFilter } } }
        : {};

    const [
      total, accepted, declined, sent, pending, bandExceptions,
    ] = await Promise.all([
      prisma.offer.count({ where: entityWhere }),
      prisma.offer.count({ where: { ...entityWhere, status: 'accepted' } }),
      prisma.offer.count({ where: { ...entityWhere, status: 'declined' } }),
      prisma.offer.count({ where: { ...entityWhere, status: 'sent' } }),
      prisma.offer.count({ where: { ...entityWhere, status: 'pending_approval' } }),
      prisma.offer.count({ where: { ...entityWhere, bandException: true } }),
    ]);

    // Decline reasons breakdown
    const declineReasons = await prisma.offer.groupBy({
      by:    ['declineReason'],
      where: { ...entityWhere, status: 'declined', declineReason: { not: null } },
      _count: { declineReason: true },
    });

    // Avg time from offer creation to acceptance (accepted offers)
    const acceptedOffers = await prisma.offer.findMany({
      where:  { ...entityWhere, status: 'accepted', acceptedAt: { not: null } },
      select: { createdAt: true, acceptedAt: true },
    });
    const avgTimeToAccept = acceptedOffers.length
      ? Math.round(
          acceptedOffers.reduce((sum, o) => {
            return sum + (new Date(o.acceptedAt) - new Date(o.createdAt)) / 86400000;
          }, 0) / acceptedOffers.length
        )
      : null;

    // Offers by entity
    const byEntity = await prisma.offer.groupBy({
      by: [],
      where: entityWhere,
      _count: true,
    });

    return ok(res, {
      summary: {
        total,
        accepted,
        declined,
        sent,
        pending,
        bandExceptions,
        acceptanceRate: total > 0 ? Math.round((accepted / (accepted + declined)) * 100) : 0,
        avgTimeToAcceptDays: avgTimeToAccept,
      },
      declineReasons: declineReasons.map(d => ({
        reason: d.declineReason,
        count:  d._count.declineReason,
      })).sort((a, b) => b.count - a.count),
      bandCompliance: {
        withinBand:  total - bandExceptions,
        exceptions:  bandExceptions,
        compliancePct: total > 0 ? Math.round(((total - bandExceptions) / total) * 100) : 100,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /analytics/scorecards ─────────────────────────────────────────
analyticsRouter.get('/scorecards', async (req, res, next) => {
  try {
    const { entity, positionId } = req.query;

    const where = {
      ...(positionId && { application: { positionId } }),
      ...(entity     && { application: { position: { entity } } }),
      ...(req.entityFilter && { application: { position: { entity: { in: req.entityFilter } } } }),
    };

    const [total, submitted, pending] = await Promise.all([
      prisma.scorecard.count({ where }),
      prisma.scorecard.count({ where: { ...where, submittedAt: { not: null } } }),
      prisma.scorecard.count({ where: { ...where, submittedAt: null } }),
    ]);

    // Score distribution
    const submitted_scorecards = await prisma.scorecard.findMany({
      where: { ...where, submittedAt: { not: null }, compositeScore: { not: null } },
      select: { compositeScore: true, recommendation: true },
    });

    const scoreRanges = { '1.0-2.0': 0, '2.0-3.0': 0, '3.0-4.0': 0, '4.0-5.0': 0 };
    const recCounts = {};

    submitted_scorecards.forEach(s => {
      const score = parseFloat(s.compositeScore);
      if      (score < 2) scoreRanges['1.0-2.0']++;
      else if (score < 3) scoreRanges['2.0-3.0']++;
      else if (score < 4) scoreRanges['3.0-4.0']++;
      else                scoreRanges['4.0-5.0']++;

      if (s.recommendation) {
        recCounts[s.recommendation] = (recCounts[s.recommendation] || 0) + 1;
      }
    });

    const avgScore = submitted_scorecards.length
      ? +(submitted_scorecards.reduce((sum, s) => sum + parseFloat(s.compositeScore), 0) / submitted_scorecards.length).toFixed(2)
      : null;

    // Overdue pending scorecards (>48h after interview)
    const twoDaysAgo = new Date();
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);

    const overdue = await prisma.scorecard.count({
      where: {
        ...where,
        submittedAt: null,
        createdAt:   { lt: twoDaysAgo },
      },
    });

    return ok(res, {
      summary:      { total, submitted, pending, overdue, avgScore },
      distribution: scoreRanges,
      recommendations: recCounts,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /analytics/time-to-hire ───────────────────────────────────────
analyticsRouter.get('/time-to-hire', async (req, res, next) => {
  try {
    const { entity } = req.query;

    const where = {
      stage: 'hired',
      isActive: true,
      ...(entity && { position: { entity } }),
      ...(req.entityFilter && { position: { entity: { in: req.entityFilter } } }),
    };

    const hired = await prisma.application.findMany({
      where,
      select: {
        appliedAt:     true,
        stageEnteredAt: true,
        position: { select: { entity: true, department: { select: { name: true } } } },
      },
    });

    const avgDays = hired.length
      ? Math.round(
          hired.reduce((sum, a) => {
            return sum + (new Date(a.stageEnteredAt) - new Date(a.appliedAt)) / 86400000;
          }, 0) / hired.length
        )
      : null;

    // Breakdown by entity
    const byEntity = {};
    hired.forEach(a => {
      const e = a.position.entity;
      if (!byEntity[e]) byEntity[e] = [];
      byEntity[e].push((new Date(a.stageEnteredAt) - new Date(a.appliedAt)) / 86400000);
    });

    const entityBreakdown = Object.entries(byEntity).map(([entity, days]) => ({
      entity,
      count:   days.length,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    }));

    return ok(res, {
      overall:        { count: hired.length, avgDays },
      byEntity:       entityBreakdown,
      benchmark:      { target: 30, industry: 42 },
      generatedAt:    new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /analytics/headcount ──────────────────────────────────────────
analyticsRouter.get('/headcount', async (req, res, next) => {
  try {
    const { entity } = req.query;

    const where = {
      isActive: true,
      ...(entity && { entity }),
      ...(req.entityFilter && { entity: { in: req.entityFilter } }),
    };

    const [byEntity, byDept, openPositions, total] = await Promise.all([
      prisma.employee.groupBy({
        by:    ['entity'],
        where,
        _count: { entity: true },
      }),
      prisma.employee.groupBy({
        by:    ['departmentId'],
        where,
        _count: { departmentId: true },
      }),
      prisma.position.count({ where: { status: 'open', isActive: true } }),
      prisma.employee.count({ where }),
    ]);

    return ok(res, {
      total,
      byEntity: byEntity.map(e => ({ entity: e.entity, count: e._count.entity })),
      openPositions,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});
