import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, validate, withOrganization } from '../../http/middleware.js';
import { enqueue, metricsQueue } from '../../queue/index.js';
import { fetchAudienceSizes } from '../../queue/processors/metrics.js';
import * as analytics from './service.js';
import { getHome } from './home.js';
import { getBrand } from '../organizations/service.js';
import { overview as googleOverview } from '../google/service.js';

const rangeSchema = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) });

export const analyticsRouter: Router = Router();

analyticsRouter.use(requireAuth, withOrganization);

/** Everything the dashboard needs, in one round trip. */
analyticsRouter.get(
  '/',
  validate(rangeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const { days } = req.query as unknown as { days: number };

    const [summary, timeseries, channels, topPosts] = await Promise.all([
      analytics.getSummary(organizationId),
      analytics.getTimeseries(organizationId, days),
      analytics.getChannelPerformance(organizationId),
      analytics.getTopPosts(organizationId),
    ]);

    res.json({ summary, timeseries, channels, topPosts, days });
  }),
);

/** The home screen, in one round trip. */
analyticsRouter.get(
  '/home',
  asyncHandler(async (req, res) => {
    res.json(await getHome(req.tenant!.organizationId));
  }),
);

/** Everything a client-facing report needs, including the brand it is for. */
analyticsRouter.get(
  '/report',
  validate(rangeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const { days } = req.query as unknown as { days: number };
    const [summary, timeseries, channels, topPosts, brand, audience, google] = await Promise.all([
      analytics.getSummary(organizationId),
      analytics.getTimeseries(organizationId, days),
      analytics.getChannelPerformance(organizationId),
      analytics.getTopPosts(organizationId, 8),
      getBrand(organizationId),
      fetchAudienceSizes(organizationId).catch(() => []),
      googleOverview(organizationId).catch(() => null),
    ]);
    res.json({
      summary,
      timeseries,
      channels,
      topPosts,
      audience,
      days,
      google: google
        ? {
            locations: google.locations.map((l) => ({ title: l.title, score: l.score, reviews: { average: l.reviews.average, total: l.reviews.total, unanswered: l.reviews.unanswered }, performance: l.performance, error: l.error })),
            sites: google.sites.map((s) => ({ site: s.site, totals: s.totals, top: s.queries.slice(0, 8), error: s.error })),
            analytics: google.analytics.map((a) => ({ property: a.property, current: a.current, previous: a.previous, error: a.error })),
            ads: google.ads.map((a) => ({ account: a.account, currency: a.currency, totals: a.totals, campaigns: a.campaigns.slice(0, 5), error: a.error })),
          }
        : null,
      brand: { name: brand.name, logoUrl: brand.logoUrl, primaryColor: brand.primaryColor, website: brand.website },
      generatedAt: new Date().toISOString(),
    });
  }),
);

/** Live follower counts, read from the platforms rather than stored. */
analyticsRouter.get(
  '/audience',
  asyncHandler(async (req, res) => {
    res.json({ audience: await fetchAudienceSizes(req.tenant!.organizationId) });
  }),
);

/**
 * Queues a metrics refresh.
 *
 * Returns immediately: polling every published post can take a while, and the
 * dashboard reads whatever snapshots exist meanwhile.
 */
analyticsRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    await enqueue(metricsQueue, 'refresh-metrics', {
      organizationId: req.tenant!.organizationId,
    });
    res.status(202).json({ queued: true });
  }),
);
