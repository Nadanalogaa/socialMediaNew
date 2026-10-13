/**
 * Analytics.
 *
 * Metrics are stored as append-only snapshots, so "current engagement" is the
 * latest snapshot per target rather than a running total — summing every
 * snapshot would multiply the same likes by how often we polled.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections, postMetrics, postTargets, posts } from '../../db/schema.js';

export interface AnalyticsSummary {
  posts: { published: number; scheduled: number; failed: number };
  engagement: { likes: number; comments: number; shares: number; total: number };
  channels: number;
}

/** Latest snapshot per target, which is what "current" means here. */
const latestMetrics = db
  .select({
    postTargetId: postMetrics.postTargetId,
    likes: postMetrics.likes,
    comments: postMetrics.comments,
    shares: postMetrics.shares,
    views: postMetrics.views,
    reach: postMetrics.reach,
    rank: sql<number>`row_number() over (
      partition by ${postMetrics.postTargetId} order by ${postMetrics.fetchedAt} desc
    )`.as('rank'),
  })
  .from(postMetrics)
  .as('latest_metrics');

export async function getSummary(organizationId: string): Promise<AnalyticsSummary> {
  const [postCounts] = await db
    .select({
      published: sql<number>`count(*) filter (where ${posts.status} = 'published')::int`,
      scheduled: sql<number>`count(*) filter (where ${posts.status} = 'scheduled')::int`,
      failed: sql<number>`count(*) filter (where ${posts.status} in ('failed','partially_failed'))::int`,
    })
    .from(posts)
    .where(eq(posts.organizationId, organizationId));

  const [engagement] = await db
    .select({
      likes: sql<number>`coalesce(sum(${latestMetrics.likes}), 0)::int`,
      comments: sql<number>`coalesce(sum(${latestMetrics.comments}), 0)::int`,
      shares: sql<number>`coalesce(sum(${latestMetrics.shares}), 0)::int`,
    })
    .from(latestMetrics)
    .innerJoin(postTargets, eq(postTargets.id, latestMetrics.postTargetId))
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(posts.organizationId, organizationId), eq(latestMetrics.rank, 1)));

  const [channelCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(connections)
    .where(eq(connections.organizationId, organizationId));

  const likes = engagement?.likes ?? 0;
  const comments = engagement?.comments ?? 0;
  const shares = engagement?.shares ?? 0;

  return {
    posts: {
      published: postCounts?.published ?? 0,
      scheduled: postCounts?.scheduled ?? 0,
      failed: postCounts?.failed ?? 0,
    },
    engagement: { likes, comments, shares, total: likes + comments + shares },
    channels: channelCount?.total ?? 0,
  };
}

export interface TimeseriesPoint {
  date: string;
  posts: number;
  engagement: number;
}

/**
 * Daily posts published and the engagement they have attracted.
 *
 * Grouped by the day the post went out, so a spike is attributable to what was
 * posted that day rather than to when we happened to poll.
 */
export async function getTimeseries(
  organizationId: string,
  days = 30,
): Promise<TimeseriesPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${posts.publishedAt}), 'YYYY-MM-DD')`,
      posts: sql<number>`count(distinct ${posts.id})::int`,
      engagement: sql<number>`coalesce(sum(
        ${latestMetrics.likes} + ${latestMetrics.comments} + ${latestMetrics.shares}
      ), 0)::int`,
    })
    .from(posts)
    .leftJoin(postTargets, eq(postTargets.postId, posts.id))
    .leftJoin(
      latestMetrics,
      and(eq(latestMetrics.postTargetId, postTargets.id), eq(latestMetrics.rank, 1)),
    )
    .where(and(eq(posts.organizationId, organizationId), gte(posts.publishedAt, since)))
    .groupBy(sql`date_trunc('day', ${posts.publishedAt})`)
    .orderBy(sql`date_trunc('day', ${posts.publishedAt})`);

  // Fill the gaps so the line has no holes where nothing was posted.
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: TimeseriesPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    const row = byDate.get(date);
    series.push({ date, posts: row?.posts ?? 0, engagement: row?.engagement ?? 0 });
  }
  return series;
}

export interface ChannelPerformance {
  connectionId: string;
  displayName: string;
  provider: string;
  posts: number;
  engagement: number;
}

export async function getChannelPerformance(
  organizationId: string,
): Promise<ChannelPerformance[]> {
  return db
    .select({
      connectionId: connections.id,
      displayName: connections.displayName,
      provider: connections.provider,
      posts: sql<number>`count(distinct ${postTargets.id})::int`,
      engagement: sql<number>`coalesce(sum(
        ${latestMetrics.likes} + ${latestMetrics.comments} + ${latestMetrics.shares}
      ), 0)::int`,
    })
    .from(connections)
    .leftJoin(postTargets, eq(postTargets.connectionId, connections.id))
    .leftJoin(
      latestMetrics,
      and(eq(latestMetrics.postTargetId, postTargets.id), eq(latestMetrics.rank, 1)),
    )
    .where(eq(connections.organizationId, organizationId))
    .groupBy(connections.id, connections.displayName, connections.provider)
    .orderBy(desc(sql`count(distinct ${postTargets.id})`));
}

export interface TopPost {
  postId: string;
  caption: string;
  publishedAt: Date | null;
  engagement: number;
  permalink: string | null;
}

export async function getTopPosts(organizationId: string, limit = 5): Promise<TopPost[]> {
  return db
    .select({
      postId: posts.id,
      caption: posts.caption,
      publishedAt: posts.publishedAt,
      permalink: sql<string | null>`max(${postTargets.permalink})`,
      engagement: sql<number>`coalesce(sum(
        ${latestMetrics.likes} + ${latestMetrics.comments} + ${latestMetrics.shares}
      ), 0)::int`,
    })
    .from(posts)
    .innerJoin(postTargets, eq(postTargets.postId, posts.id))
    .leftJoin(
      latestMetrics,
      and(eq(latestMetrics.postTargetId, postTargets.id), eq(latestMetrics.rank, 1)),
    )
    .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'published')))
    .groupBy(posts.id, posts.caption, posts.publishedAt)
    .orderBy(desc(sql`coalesce(sum(
      ${latestMetrics.likes} + ${latestMetrics.comments} + ${latestMetrics.shares}
    ), 0)`))
    .limit(limit);
}
