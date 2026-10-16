/**
 * When to post.
 *
 * Two answers to the same question. The queue answers from the organisation's
 * own posting times ("9:00 on weekdays"): the next free one is where a queued
 * post goes. Best times answer from history: which weekday and hour have
 * earned the most engagement for this organisation's published posts.
 *
 * Everything here is computed in the organisation's time zone, because "9am"
 * means 9am in Chennai, not on the server.
 */

import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations, postMetrics, postTargets, posts, type PostingSlot } from '../../db/schema.js';

// --- Time zone arithmetic without a library ---------------------------------

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    // An unknown zone name must not take scheduling down with it.
    return formatter('Asia/Kolkata');
  }
}

/** The wall-clock reading in a zone at an instant. */
export function localParts(timeZone: string, at: Date): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(at)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? 'Sun'),
  };
}

function offsetMinutes(timeZone: string, at: Date): number {
  const p = localParts(timeZone, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant at which a zone's clock reads the given local time. */
export function fromLocal(
  timeZone: string,
  local: { year: number; month: number; day: number; hour: number; minute: number },
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  // Two passes settle the offset across a daylight-saving boundary.
  let offset = offsetMinutes(timeZone, new Date(guess));
  offset = offsetMinutes(timeZone, new Date(guess - offset * 60_000));
  return new Date(guess - offset * 60_000);
}

// --- The queue ---------------------------------------------------------------

export interface SlotSuggestion {
  at: Date;
  /** "Tue 19:30", in the organisation's zone, ready to show. */
  label: string;
}

/** Sensible defaults for an Indian small business until times are set. */
export const DEFAULT_SLOTS: PostingSlot[] = [
  { days: [1, 2, 3, 4, 5, 6, 0], time: '09:00' },
  { days: [1, 2, 3, 4, 5, 6, 0], time: '19:30' },
];

/**
 * The next free posting times.
 *
 * Walks the coming days, expands each day's slots, and drops any slot that
 * already has a post within half an hour, so adding to the queue spreads
 * posts out instead of stacking them.
 */
export async function nextFreeSlots(organizationId: string, count = 5): Promise<SlotSuggestion[]> {
  const [org] = await db
    .select({ timezone: organizations.timezone, postingSlots: organizations.postingSlots })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const timezone = org?.timezone ?? 'Asia/Kolkata';
  const slots = org?.postingSlots?.length ? org.postingSlots : DEFAULT_SLOTS;

  const now = new Date();
  const taken = await db
    .select({ at: posts.scheduledAt })
    .from(posts)
    .where(
      and(
        eq(posts.organizationId, organizationId),
        eq(posts.status, 'scheduled'),
        gte(posts.scheduledAt, now),
      ),
    );
  const takenTimes = taken.map((row) => row.at?.getTime() ?? 0);

  const candidates: Date[] = [];
  for (let offset = 0; offset < 21 && candidates.length < count * 3; offset++) {
    const dayStart = localParts(timezone, new Date(now.getTime() + offset * 86_400_000));
    for (const slot of slots) {
      if (!slot.days.includes(dayStart.weekday)) continue;
      const [hour, minute] = slot.time.split(':').map(Number);
      const at = fromLocal(timezone, { ...dayStart, hour: hour ?? 9, minute: minute ?? 0 });
      if (at.getTime() < now.getTime() + 5 * 60_000) continue;
      if (takenTimes.some((t) => Math.abs(t - at.getTime()) < 30 * 60_000)) continue;
      candidates.push(at);
    }
  }

  return candidates
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, count)
    .map((at) => ({ at, label: describe(timezone, at) }));
}

function describe(timeZone: string, at: Date): string {
  const p = localParts(timeZone, at);
  return `${WEEKDAYS[p.weekday]} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

// --- Best times --------------------------------------------------------------

export interface BestTime {
  weekday: number;
  hour: number;
  label: string;
  /** Average engagement per post in this hour. */
  score: number;
  samples: number;
}

export interface BestTimesReport {
  /** 'history' once there are enough published posts to learn from. */
  basis: 'history' | 'default';
  timezone: string;
  times: BestTime[];
}

/**
 * Weekday-and-hour buckets ranked by average engagement.
 *
 * Fewer than five published posts is a guess, not a pattern, so the report
 * says so and offers the usual peaks for an Indian audience instead.
 */
export async function bestTimes(organizationId: string): Promise<BestTimesReport> {
  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const timezone = org?.timezone ?? 'Asia/Kolkata';

  const latest = db
    .select({
      postTargetId: postMetrics.postTargetId,
      engagement: sql<number>`(${postMetrics.likes} + ${postMetrics.comments} * 2 + ${postMetrics.shares} * 3)`.as(
        'engagement',
      ),
      rank: sql<number>`row_number() over (partition by ${postMetrics.postTargetId} order by ${postMetrics.fetchedAt} desc)`.as(
        'rank',
      ),
    })
    .from(postMetrics)
    .as('latest');

  const rows = await db
    .select({ publishedAt: postTargets.publishedAt, engagement: latest.engagement })
    .from(latest)
    .innerJoin(postTargets, eq(postTargets.id, latest.postTargetId))
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(
      and(
        eq(posts.organizationId, organizationId),
        eq(latest.rank, 1),
        isNotNull(postTargets.publishedAt),
        inArray(postTargets.status, ['published']),
      ),
    )
    .limit(1000);

  if (rows.length < 5) {
    const defaults: [number, number][] = [
      [2, 19],
      [4, 19],
      [6, 11],
      [0, 19],
      [3, 9],
    ];
    return {
      basis: 'default',
      timezone,
      times: defaults.map(([weekday, hour]) => ({
        weekday,
        hour,
        label: `${WEEKDAYS[weekday]} ${String(hour).padStart(2, '0')}:00`,
        score: 0,
        samples: 0,
      })),
    };
  }

  const buckets = new Map<string, { weekday: number; hour: number; total: number; n: number }>();
  for (const row of rows) {
    if (!row.publishedAt) continue;
    const p = localParts(timezone, row.publishedAt);
    const key = `${p.weekday}-${p.hour}`;
    const bucket = buckets.get(key) ?? { weekday: p.weekday, hour: p.hour, total: 0, n: 0 };
    bucket.total += Number(row.engagement ?? 0);
    bucket.n += 1;
    buckets.set(key, bucket);
  }

  const times = [...buckets.values()]
    .map((b) => ({
      weekday: b.weekday,
      hour: b.hour,
      label: `${WEEKDAYS[b.weekday]} ${String(b.hour).padStart(2, '0')}:00`,
      score: Math.round((b.total / b.n) * 10) / 10,
      samples: b.n,
    }))
    .sort((a, b) => b.score - a.score || b.samples - a.samples)
    .slice(0, 5);

  return { basis: 'history', timezone, times };
}
