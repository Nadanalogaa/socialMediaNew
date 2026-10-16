import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, validate, withOrganization } from '../../http/middleware.js';
import { enqueue, metricsQueue } from '../../queue/index.js';
import { fetchAudienceSizes } from '../../queue/processors/metrics.js';
import * as analytics from './service.js';
import { getBrand } from '../organizations/service.js';

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

/** Everything a client-facing report needs, including the brand it is for. */
analyticsRouter.get(
  '/report',
  validate(rangeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const { days } = req.query as unknown as { days: number };
    const [summary, timeseries, channels, topPosts, brand, audience] = await Promise.all([
      analytics.getSummary(organizationId),
      analytics.getTimeseries(organizationId, days),
      analytics.getChannelPerformance(organizationId),
      analytics.getTopPosts(organizationId, 8),
      getBrand(organizationId),
      fetchAudienceSizes(organizationId).catch(() => []),
    ]);
    res.json({
      summary,
      timeseries,
      channels,
      topPosts,
      audience,
      days,
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
