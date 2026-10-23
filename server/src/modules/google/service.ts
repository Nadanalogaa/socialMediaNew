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
import { notFound, serviceUnavailable } from '../../lib/errors.js';
import { env, features } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import * as google from '../../integrations/google.js';
import * as gemini from '../../integrations/gemini.js';
import { getGoogleAccessToken } from '../connections/google.js';
import { getBrand } from '../organizations/service.js';

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

export interface PerformanceWindow {
  current: google.LocationPerformance;
  previous: google.LocationPerformance;
}

export interface LocationReport {
  connectionId: string;
  title: string;
  address: string | null;
  category: string | null;
  locality: string | null;
  mapsUri: string | null;
  reviewUri: string | null;
  score: number;
  items: ScoreItem[];
  reviews: { average: number; total: number; unanswered: number; recent: google.GoogleReview[] };
  /** Views, calls, directions, website clicks: last 28 days against the 28 before. */
  performance: PerformanceWindow | null;
  error: string | null;
}

export interface AnalyticsReport {
  connectionId: string;
  property: string;
  period: { from: string; to: string };
  current: google.AnalyticsSummary | null;
  previous: google.AnalyticsSummary | null;
  /** The tag the website must carry, and whether it was found there. */
  tag: { measurementId: string; siteUrl: string; installed: boolean | null } | null;
  error: string | null;
}

export interface AdsReport {
  connectionId: string;
  account: string;
  currency: string;
  campaigns: google.AdsCampaignRow[];
  totals: { impressions: number; clicks: number; costMicros: number; conversions: number };
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
    const now = Date.now();
    const perfTo = new Date(now - 3 * DAY);
    const perfFrom = new Date(perfTo.getTime() - 27 * DAY);
    const prevTo = new Date(perfFrom.getTime() - DAY);
    const prevFrom = new Date(prevTo.getTime() - 27 * DAY);
    const [details, reviewData, lastPostAt, media, performance] = await Promise.all([
      google.getLocationDetails(token, row.externalId),
      google.listReviews(token, row.externalId),
      google.latestLocalPostAt(token, row.externalId).catch(() => null),
      google.countMedia(token, row.externalId).catch(() => ({ count: 0, latestAt: null })),
      Promise.all([
        google.fetchLocationPerformance(token, row.externalId, perfFrom, perfTo),
        google.fetchLocationPerformance(token, row.externalId, prevFrom, prevTo),
      ])
        .then(([current, previous]) => ({ current, previous }))
        .catch((error) => {
          logger.warn({ err: error, connectionId }, 'Performance unavailable');
          return null;
        }),
    ]);

    // Remembered on the row: the website for Business Profile post buttons,
    // and the category, locality and coordinates for keywords and competitors.
    const remembered = {
      website: details.website,
      placeId: details.placeId,
      category: details.primaryCategory,
      locality: details.locality,
      sublocality: details.sublocality,
      latlng: details.latlng,
    };
    if (JSON.stringify(remembered) !== JSON.stringify({ website: row.metadata?.website, placeId: row.metadata?.placeId, category: row.metadata?.category, locality: row.metadata?.locality, sublocality: row.metadata?.sublocality, latlng: row.metadata?.latlng })) {
      await db
        .update(connections)
        .set({ metadata: { ...(row.metadata ?? {}), ...remembered } })
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
      category: details.primaryCategory,
      locality: details.sublocality ?? details.locality,
      mapsUri: details.mapsUri,
      reviewUri: details.newReviewUri ?? (details.placeId ? `https://search.google.com/local/writereview?placeid=${details.placeId}` : null),
      score,
      items,
      reviews: { average: reviewData.averageRating, total: reviewData.total, unanswered, recent: reviewData.reviews.slice(0, 20) },
      performance,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, connectionId }, 'Business Profile report failed');
    return { ...base, category: null, locality: null, mapsUri: null, reviewUri: null, score: 0, items: [], reviews: { average: 0, total: 0, unanswered: 0, recent: [] }, performance: null, error: message };
  }
}

// --- Keywords ---------------------------------------------------------------------

export interface KeywordSuggestion {
  phrase: string;
  /** Where it came from: a real search the site appeared for, or a pattern for the category and area. */
  source: 'search' | 'category';
  position?: number;
  clicks?: number;
  impressions?: number;
}

/**
 * What people search for, and what they would search for.
 *
 * Real queries from Search Console come first, ranked by impressions — the
 * ones with many impressions and a poor position are the opportunities. Then
 * the phrases a local customer types for this kind of business in this area.
 */
export async function keywordSuggestions(organizationId: string): Promise<{ keywords: KeywordSuggestion[]; basis: string[] }> {
  const rows = await db
    .select({ id: connections.id, provider: connections.provider, displayName: connections.displayName, metadata: connections.metadata })
    .from(connections)
    .where(and(eq(connections.organizationId, organizationId), inArray(connections.provider, ['google_business', 'google_search_console'])));

  const seen = new Set<string>();
  const out: KeywordSuggestion[] = [];
  const basis: string[] = [];
  const add = (k: KeywordSuggestion) => {
    const key = k.phrase.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...k, phrase: key });
  };

  for (const site of rows.filter((r) => r.provider === 'google_search_console')) {
    try {
      const report = await siteReport(organizationId, site.id);
      if (report.queries.length > 0) basis.push(`searches on ${report.site}`);
      for (const q of [...report.queries].sort((a, b) => b.impressions - a.impressions)) {
        add({ phrase: q.query, source: 'search', position: q.position, clicks: q.clicks, impressions: q.impressions });
      }
    } catch {
      /* no search data yet */
    }
  }

  const brand = await getBrand(organizationId).catch(() => null);
  for (const loc of rows.filter((r) => r.provider === 'google_business')) {
    const category = typeof loc.metadata?.category === 'string' ? (loc.metadata.category as string).toLowerCase() : null;
    const area = (typeof loc.metadata?.sublocality === 'string' && loc.metadata.sublocality) || (typeof loc.metadata?.locality === 'string' && loc.metadata.locality) || null;
    const city = typeof loc.metadata?.locality === 'string' ? (loc.metadata.locality as string) : null;
    if (!category) continue;
    basis.push(`${category}${area ? ` in ${area}` : ''}`);
    const places = [area, city].filter((p): p is string => Boolean(p)).map((p) => p.toLowerCase());
    for (const place of [...new Set(places)]) {
      add({ phrase: `${category} in ${place}`, source: 'category' });
      add({ phrase: `best ${category} ${place}`, source: 'category' });
      add({ phrase: `${category} ${place} fees`, source: 'category' });
    }
    add({ phrase: `${category} near me`, source: 'category' });
    add({ phrase: `${category} reviews`, source: 'category' });
    // Services named in the brand kit become long-tail phrases.
    const services = (brand?.description ?? '').match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/g) ?? [];
    for (const service of services.slice(0, 6)) {
      for (const place of places.slice(0, 1)) add({ phrase: `${service.toLowerCase()} classes ${place}`, source: 'category' });
    }
  }

  return { keywords: out.slice(0, 40), basis };
}

// --- Competitors ------------------------------------------------------------------

export interface CompetitorSnapshot {
  connectionId: string;
  query: string;
  you: { name: string; rating: number | null; reviews: number; photos: number; website: boolean } | null;
  competitors: google.NearbyPlace[];
  /** Plain-language takeaways. */
  notes: string[];
  error: string | null;
}

const competitorCache = new Map<string, { at: number; snapshot: CompetitorSnapshot }>();
const COMPETITOR_TTL = 24 * 60 * 60 * 1000;

export async function competitors(organizationId: string, connectionId: string): Promise<CompetitorSnapshot> {
  const cached = competitorCache.get(connectionId);
  if (cached && Date.now() - cached.at < COMPETITOR_TTL) return cached.snapshot;

  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), eq(connections.provider, 'google_business')))
    .limit(1);
  if (!row) throw notFound('Business Profile not found');
  if (!features.places) throw serviceUnavailable('The competitor snapshot is not enabled on this service yet.');

  const meta = row.metadata ?? {};
  const category = typeof meta.category === 'string' ? meta.category : null;
  const latlng = meta.latlng as { latitude: number; longitude: number } | null | undefined;
  const area = (typeof meta.sublocality === 'string' && meta.sublocality) || (typeof meta.locality === 'string' && meta.locality) || '';
  const base = { connectionId: row.id, query: category ? `${category} ${area}`.trim() : row.displayName };
  if (!category || !latlng) {
    return { ...base, you: null, competitors: [], notes: [], error: 'Open the Google tab once so the listing details are read, then try again.' };
  }

  try {
    const places = await google.searchCompetitors(env.GOOGLE_PLACES_API_KEY!, base.query, latlng);
    const placeId = typeof meta.placeId === 'string' ? meta.placeId : null;
    const mine = places.find((p) => p.placeId === placeId);
    const others = places.filter((p) => p.placeId !== placeId).slice(0, 6);
    const you = mine ? { name: mine.name, rating: mine.rating, reviews: mine.reviews, photos: mine.photos, website: mine.website } : null;

    const notes: string[] = [];
    if (you) {
      const moreReviews = others.filter((o) => o.reviews > you.reviews).length;
      if (moreReviews > 0) notes.push(`${moreReviews} of ${others.length} nearby have more reviews than you — ask every customer for one.`);
      const betterRated = others.filter((o) => (o.rating ?? 0) > (you.rating ?? 0) + 0.2).length;
      if (betterRated > 0) notes.push(`${betterRated} are rated higher; replying to every review and fixing what low reviews mention closes that gap.`);
      if (!you.website && others.some((o) => o.website)) notes.push('Competitors list a website; add yours (or your Instagram) to the listing.');
      if (notes.length === 0) notes.push('You lead the nearby listings — keep posting weekly and collecting reviews to stay there.');
    } else {
      notes.push('Your listing did not appear in the first results for this search — the category, address or name on the profile may not match how customers search.');
    }
    const snapshot: CompetitorSnapshot = { ...base, you, competitors: others, notes, error: null };
    competitorCache.set(connectionId, { at: Date.now(), snapshot });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, connectionId }, 'Competitor snapshot failed');
    return { ...base, you: null, competitors: [], notes: [], error: message };
  }
}

// --- AI suggestions -----------------------------------------------------------------

export async function suggestReviewReply(organizationId: string, review: { reviewer: string; rating: number; comment: string }): Promise<{ reply: string; source: 'ai' | 'template' }> {
  const brand = await getBrand(organizationId);
  const context = { name: brand.name, industry: brand.industry, description: brand.description, toneOfVoice: brand.toneOfVoice, targetAudience: brand.targetAudience };
  if (features.ai) {
    try {
      return { reply: await gemini.suggestReviewReply(context, review), source: 'ai' };
    } catch (error) {
      logger.warn({ err: error }, 'AI reply failed; using the template');
    }
  }
  return { reply: gemini.templateReviewReply(context, review), source: 'template' };
}

export async function analyticsReport(organizationId: string, connectionId: string): Promise<AnalyticsReport> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), eq(connections.provider, 'google_analytics')))
    .limit(1);
  if (!row) throw notFound('Analytics property not found');
  const to = new Date(Date.now() - DAY);
  const from = new Date(to.getTime() - 27 * DAY);
  const prevTo = new Date(from.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - 27 * DAY);
  const base = { connectionId: row.id, property: row.displayName, period: { from: isoDay(from), to: isoDay(to) } };
  try {
    const token = await getGoogleAccessToken(organizationId, row.id);
    const [current, previous, stream] = await Promise.all([
      google.analyticsSummary(token, row.externalId, isoDay(from), isoDay(to)),
      google.analyticsSummary(token, row.externalId, isoDay(prevFrom), isoDay(prevTo)),
      google.analyticsStream(token, row.externalId).catch(() => null),
    ]);
    // Only worth checking the site when there is nothing to show: a tag that
    // reports visits is obviously installed.
    const tag = stream
      ? { ...stream, installed: current.sessions > 0 ? true : await google.tagInstalled(stream.siteUrl, stream.measurementId) }
      : null;
    return { ...base, current, previous, tag, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, connectionId }, 'Analytics report failed');
    return { ...base, current: null, previous: null, tag: null, error: message };
  }
}

export async function adsReport(organizationId: string, connectionId: string): Promise<AdsReport> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), eq(connections.provider, 'google_ads')))
    .limit(1);
  if (!row) throw notFound('Google Ads account not found');
  const base = { connectionId: row.id, account: row.displayName, currency: typeof row.metadata?.currency === 'string' ? (row.metadata.currency as string) : 'INR' };
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return { ...base, campaigns: [], totals: { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }, error: 'Google Ads is not enabled on this service yet.' };
  }
  try {
    const token = await getGoogleAccessToken(organizationId, row.id);
    const campaigns = await google.adsCampaignReport(token, env.GOOGLE_ADS_DEVELOPER_TOKEN, row.externalId, 30, env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
    const totals = campaigns.reduce(
      (t, c) => ({ impressions: t.impressions + c.impressions, clicks: t.clicks + c.clicks, costMicros: t.costMicros + c.costMicros, conversions: t.conversions + c.conversions }),
      { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
    );
    return { ...base, campaigns, totals, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, connectionId }, 'Ads report failed');
    return { ...base, campaigns: [], totals: { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }, error: message };
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
    .select({ id: connections.id, provider: connections.provider, displayName: connections.displayName, metadata: connections.metadata })
    .from(connections)
    .where(
      and(
        eq(connections.organizationId, organizationId),
        inArray(connections.provider, ['google_business', 'google_search_console', 'youtube_channel', 'google_analytics', 'google_ads']),
      ),
    );
  const [locations, sites, analytics, ads] = await Promise.all([
    Promise.all(rows.filter((r) => r.provider === 'google_business').map((r) => locationReport(organizationId, r.id))),
    Promise.all(rows.filter((r) => r.provider === 'google_search_console').map((r) => siteReport(organizationId, r.id))),
    Promise.all(rows.filter((r) => r.provider === 'google_analytics').map((r) => analyticsReport(organizationId, r.id))),
    Promise.all(rows.filter((r) => r.provider === 'google_ads').map((r) => adsReport(organizationId, r.id))),
  ]);
  // The Google account itself is stored with the YouTube channel, so a
  // sign-in that found no listings still shows as connected.
  const account = rows.find((r) => r.provider === 'youtube_channel');
  return {
    locations,
    sites,
    analytics,
    ads,
    adsEnabled: Boolean(env.GOOGLE_ADS_DEVELOPER_TOKEN),
    connected: rows.length > 0,
    account: account ? { name: account.displayName, email: typeof account.metadata?.email === 'string' ? account.metadata.email : null } : null,
  };
}

export async function reply(organizationId: string, connectionId: string, reviewName: string, comment: string): Promise<void> {
  const token = await getGoogleAccessToken(organizationId, connectionId);
  await google.replyToReview(token, reviewName, comment.trim());
}
