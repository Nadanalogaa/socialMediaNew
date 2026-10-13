/**
 * Metrics processor.
 *
 * Refreshes engagement for published posts. Snapshots are appended rather than
 * overwritten, so growth over time can be charted and a platform's figure going
 * down (a deleted comment, a removed like) is visible rather than silently
 * replacing history.
 */

import type { Job } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections, postMetrics, postTargets, posts } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import * as meta from '../../integrations/meta.js';
import { markConnectionError, resolveConnection } from '../../modules/connections/service.js';

export interface MetricsJobData {
  organizationId: string;
  /** Omit to refresh every published target in the organization. */
  postId?: string;
}

export async function processMetricsJob(job: Job<MetricsJobData>): Promise<void> {
  const { organizationId, postId } = job.data;

  const targets = await db
    .select({
      id: postTargets.id,
      connectionId: postTargets.connectionId,
      provider: postTargets.provider,
      externalPostId: postTargets.externalPostId,
    })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(
      postId
        ? and(eq(posts.organizationId, organizationId), eq(posts.id, postId))
        : and(eq(posts.organizationId, organizationId), eq(postTargets.status, 'published')),
    );

  let refreshed = 0;

  for (const target of targets) {
    if (!target.externalPostId) continue;

    try {
      const connection = await resolveConnection(organizationId, target.connectionId);
      const metrics =
        connection.provider === 'instagram_business'
          ? await meta.getInstagramPostMetrics(target.externalPostId, connection.accessToken)
          : await meta.getFacebookPostMetrics(target.externalPostId, connection.accessToken);

      if (!metrics) {
        // The post is gone from the platform; record that rather than guessing.
        await db
          .update(postTargets)
          .set({ status: 'deleted_on_platform', updatedAt: new Date() })
          .where(eq(postTargets.id, target.id));
        continue;
      }

      await db.insert(postMetrics).values({ postTargetId: target.id, ...metrics });
      refreshed++;
    } catch (error) {
      if (error instanceof meta.GraphApiError && error.isAuthError) {
        await markConnectionError(target.connectionId, error.message, true);
      }
      logger.warn({ err: error, targetId: target.id }, 'Could not refresh metrics');
    }
  }

  logger.info({ organizationId, refreshed, total: targets.length }, 'Metrics refresh finished');
}

/** Follower counts per connected channel, read live rather than stored. */
export async function fetchAudienceSizes(
  organizationId: string,
): Promise<{ connectionId: string; displayName: string; provider: string; followers: number }[]> {
  const rows = await db
    .select({ id: connections.id, provider: connections.provider, displayName: connections.displayName })
    .from(connections)
    .where(
      and(
        eq(connections.organizationId, organizationId),
        inArray(connections.provider, ['facebook_page', 'instagram_business']),
      ),
    );

  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        const connection = await resolveConnection(organizationId, row.id);
        const followers = await meta.getFollowerCount(
          connection.externalId,
          connection.accessToken,
          connection.provider === 'instagram_business' ? 'instagram' : 'facebook',
        );
        return { connectionId: row.id, displayName: row.displayName, provider: row.provider, followers };
      } catch (error) {
        logger.warn({ err: error, connectionId: row.id }, 'Could not read follower count');
        return { connectionId: row.id, displayName: row.displayName, provider: row.provider, followers: 0 };
      }
    }),
  );

  return results;
}
