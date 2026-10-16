/**
 * The home screen's numbers: what needs attention, how much is lined up,
 * how the week went, and how consistently the workspace has been posting.
 */

import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections, postMetrics, postTargets, posts } from '../../db/schema.js';
import { bestTimes } from '../posts/scheduling.js';
import { getTopPosts } from './service.js';

const DAY = 86_400_000;

export async function getHome(organizationId: string) {
  const now = new Date();

  const [failed, expiring, pending, scheduled, heatRows, thisWeek, lastWeek, top, best] = await Promise.all([
    db
      .select({ id: posts.id, caption: posts.caption, status: posts.status, updatedAt: posts.updatedAt })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), inArray(posts.status, ['failed', 'partially_failed'])))
      .orderBy(desc(posts.updatedAt))
      .limit(5),
    db
      .select({ id: connections.id, displayName: connections.displayName, provider: connections.provider, status: connections.status, tokenExpiresAt: connections.tokenExpiresAt })
      .from(connections)
      .where(
        and(
          eq(connections.organizationId, organizationId),
          sql`(${connections.status} <> 'active' or (${connections.tokenExpiresAt} is not null and ${connections.tokenExpiresAt} < ${new Date(now.getTime() + 10 * DAY).toISOString()}::timestamptz))`,
        ),
      ),
    db
      .select({ id: posts.id, caption: posts.caption, updatedAt: posts.updatedAt, scheduledAt: posts.scheduledAt })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'pending_approval')))
      .orderBy(desc(posts.updatedAt))
      .limit(5),
    db
      .select({ id: posts.id, caption: posts.caption, scheduledAt: posts.scheduledAt })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'scheduled'), isNotNull(posts.scheduledAt), gte(posts.scheduledAt, now)))
      .orderBy(posts.scheduledAt)
      .limit(200),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${posts.publishedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'published'), gte(posts.publishedAt, new Date(now.getTime() - 84 * DAY))))
      .groupBy(sql`date_trunc('day', ${posts.publishedAt})`),
    weekStats(organizationId, new Date(now.getTime() - 7 * DAY), now),
    weekStats(organizationId, new Date(now.getTime() - 14 * DAY), new Date(now.getTime() - 7 * DAY)),
    getTopPosts(organizationId, 3),
    bestTimes(organizationId),
  ]);

  // Runway: how many days from today have at least one scheduled post.
  const daysCovered = new Set(scheduled.map((p) => p.scheduledAt!.toISOString().slice(0, 10))).size;
  const lastScheduled = scheduled[scheduled.length - 1]?.scheduledAt ?? null;

  const heatmap: { date: string; count: number }[] = [];
  const byDay = new Map(heatRows.map((r) => [r.day, r.count]));
  for (let offset = 83; offset >= 0; offset--) {
    const date = new Date(now.getTime() - offset * DAY).toISOString().slice(0, 10);
    heatmap.push({ date, count: byDay.get(date) ?? 0 });
  }

  return {
    attention: { failed, expiring, pending },
    runway: { scheduledCount: scheduled.length, daysCovered, lastScheduled, next: scheduled.slice(0, 3) },
    recap: { thisWeek, lastWeek },
    heatmap,
    topPosts: top,
    bestTimes: best,
  };
}

async function weekStats(organizationId: string, from: Date, to: Date) {
  const latest = db
    .select({
      postTargetId: postMetrics.postTargetId,
      engagement: sql<number>`(${postMetrics.likes} + ${postMetrics.comments} + ${postMetrics.shares})`.as('engagement'),
      rank: sql<number>`row_number() over (partition by ${postMetrics.postTargetId} order by ${postMetrics.fetchedAt} desc)`.as('rank'),
    })
    .from(postMetrics)
    .as('latest');
  const [row] = await db
    .select({
      published: sql<number>`count(distinct ${posts.id})::int`,
      engagement: sql<number>`coalesce(sum(case when ${latest.rank} = 1 then ${latest.engagement} else 0 end), 0)::int`,
    })
    .from(posts)
    .leftJoin(postTargets, eq(postTargets.postId, posts.id))
    .leftJoin(latest, eq(latest.postTargetId, postTargets.id))
    .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'published'), gte(posts.publishedAt, from), lt(posts.publishedAt, to)));
  return { published: row?.published ?? 0, engagement: row?.engagement ?? 0 };
}
