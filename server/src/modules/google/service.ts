/**
 * Google promotion: how a business looks on Google, and what to do about it.
 *
 * The local-SEO score is a checklist of the things that demonstrably move a
 * listing up the map pack — completeness, photos, posts, reviews and replies —
 * each with a plain instruction. Rankings come from Search Console: the real
 * queries the website appears for, and where.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import * as google from '../../integrations/google.js';
import { getGoogleAccessToken } from '../connections/google.js';

const DAY = 86_400_000;

export interface ScoreItem {
  key: string;
  label: string;
  points: number;
  earned: number;
  ok: boolean;
  /** What to do, when not ok. */
  fix: string;
}

export interface LocationReport {
  connectionId: string;
  title: string;
  address: string | null;
  mapsUri: string | null;
  reviewUri: string | null;
  score: number;
  items: ScoreItem[];
  reviews: { average: number; total: number; unanswered: number; recent: google.GoogleReview[] };
  error: string | null;
}

export interface SiteReport {
  connectionId: string;
  site: string;
  period: { from: string; to: string };
  queries: (google.QueryRow & { previousPosition: number | null; change: number | null })[];
  totals: { clicks: number; impressions: number; previousClicks: number };
  error: string | null;
}

function age(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null;
}

export async function locationReport(organizationId: string, connectionId: string): Promise<LocationReport> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), eq(connections.provider, 'google_business')))
    .limit(1);
  if (!row) throw notFound('Business Profile not found');
  const base = {
    connectionId: row.id,
    title: row.displayName,
    address: typeof row.metadata?.address === 'string' ? (row.metadata.address as string) : null,
  };

  try {
    const token = await getGoogleAccessToken(organizationId, row.id);
    const [details, reviewData, lastPostAt, media] = await Promise.all([
      google.getLocationDetails(token, row.externalId),
      google.listReviews(token, row.externalId),
      google.latestLocalPostAt(token, row.externalId).catch(() => null),
      google.countMedia(token, row.externalId).catch(() => ({ count: 0, latestAt: null })),
    ]);

    // Remember the website so Business Profile posts can carry a button to it.
    if (details.website && row.metadata?.website !== details.website) {
      await db
        .update(connections)
        .set({ metadata: { ...(row.metadata ?? {}), website: details.website, placeId: details.placeId } })
        .where(eq(connections.id, row.id));
    }

    const unanswered = reviewData.reviews.filter((r) => !r.reply).length;
    const latestReviewAge = age(reviewData.reviews[0]?.createdAt ?? null);
    const postAge = age(lastPostAt);
    const photoAge = age(media.latestAt);

    const items: ScoreItem[] = [
      item('category', 'Primary category set', 10, Boolean(details.primaryCategory), 'Choose the category customers search for (e.g. "Dance school") in your Business Profile.'),
      item('description', 'Description of 250+ characters', 10, details.description.length >= 250, 'Write a description that names your services, area and what makes you different.'),
      item('phone', 'Phone number', 5, Boolean(details.phone), 'Add the phone number customers should call.'),
      item('website', 'Website link', 5, Boolean(details.website), 'Add your website (or your Instagram page if you have no site).'),
      item('hours', 'Opening hours', 10, details.hasHours, 'Set opening hours — listings without hours rank lower and get fewer calls.'),
      item('photos', '10+ photos, one added this month', 10, media.count >= 10 && photoAge !== null && photoAge <= 30, 'Add photos of your place, your work and your team; add a new one every few weeks.'),
      item('posts', 'A post in the last 14 days', 15, postAge !== null && postAge <= 14, 'Publish an update, offer or event to the listing — PostReels can send your posts here.'),
      item('reviewCount', '10+ reviews', 10, reviewData.total >= 10, 'Ask happy customers for a review — share your review link after every visit.'),
      item('rating', 'Average rating 4.3+', 5, reviewData.averageRating >= 4.3, 'Fix what the low reviews mention, and keep asking satisfied customers.'),
      item('replies', 'Every review answered', 15, unanswered === 0, `Reply to ${unanswered} unanswered review${unanswered === 1 ? '' : 's'} — Google shows that you respond.`),
      item('recentReview', 'A review in the last 30 days', 5, latestReviewAge !== null && latestReviewAge <= 30, 'Recent reviews matter more than old ones; keep a steady trickle coming.'),
    ];
    const score = items.reduce((sum, i) => sum + i.earned, 0);

    return {
      ...base,
      title: details.title || base.title,
      mapsUri: details.mapsUri,
      reviewUri: details.newReviewUri ?? (details.placeId ? `https://search.google.com/local/writereview?placeid=${details.placeId}` : null),
      score,
      items,
      reviews: { average: reviewData.averageRating, total: reviewData.total, unanswered, recent: reviewData.reviews.slice(0, 20) },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, connectionId }, 'Business Profile report failed');
    return { ...base, mapsUri: null, reviewUri: null, score: 0, items: [], reviews: { average: 0, total: 0, unanswered: 0, recent: [] }, error: message };
  }
}

function item(key: string, label: string, points: number, ok: boolean, fix: string): ScoreItem {
  return { key, label, points, earned: ok ? points : 0, ok, fix };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function siteReport(organizationId: string, connectionId: string): Promise<SiteReport> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), eq(connections.provider, 'google_search_console')))
    .limit(1);
  if (!row) throw notFound('Search Console property not found');

  // Search Console data lags ~2 days; two 28-day windows, compared.
  const to = new Date(Date.now() - 2 * DAY);
  const from = new Date(to.getTime() - 27 * DAY);
  const prevTo = new Date(from.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - 27 * DAY);
  const base = { connectionId: row.id, site: row.displayName, period: { from: isoDay(from), to: isoDay(to) } };

  try {
    const token = await getGoogleAccessToken(organizationId, row.id);
    const [current, previous] = await Promise.all([
      google.searchAnalytics(token, row.externalId, isoDay(from), isoDay(to), 25),
      google.searchAnalytics(token, row.externalId, isoDay(prevFrom), isoDay(prevTo), 100),
    ]);
    const before = new Map(previous.map((r) => [r.query, r]));
    return {
      ...base,
      queries: current.map((r) => {
        const p = before.get(r.query);
        return { ...r, previousPosition: p?.position ?? null, change: p ? Math.round((p.position - r.position) * 10) / 10 : null };
      }),
      totals: {
        clicks: current.reduce((s, r) => s + r.clicks, 0),
        impressions: current.reduce((s, r) => s + r.impressions, 0),
        previousClicks: previous.reduce((s, r) => s + r.clicks, 0),
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, connectionId }, 'Search Console report failed');
    return { ...base, queries: [], totals: { clicks: 0, impressions: 0, previousClicks: 0 }, error: message };
  }
}

export async function overview(organizationId: string) {
  const rows = await db
    .select({ id: connections.id, provider: connections.provider })
    .from(connections)
    .where(and(eq(connections.organizationId, organizationId), inArray(connections.provider, ['google_business', 'google_search_console'])));
  const [locations, sites] = await Promise.all([
    Promise.all(rows.filter((r) => r.provider === 'google_business').map((r) => locationReport(organizationId, r.id))),
    Promise.all(rows.filter((r) => r.provider === 'google_search_console').map((r) => siteReport(organizationId, r.id))),
  ]);
  return { locations, sites, connected: rows.length > 0 };
}

export async function reply(organizationId: string, connectionId: string, reviewName: string, comment: string): Promise<void> {
  const token = await getGoogleAccessToken(organizationId, connectionId);
  await google.replyToReview(token, reviewName, comment.trim());
}
