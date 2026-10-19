/**
 * Google OAuth and API access.
 *
 * One Google Cloud project serves every tenant: a customer signs in with their
 * own Google account and grants access to their own Business Profile or
 * YouTube channel. We never hold their password, and they never see a
 * developer console.
 *
 * Google access tokens expire after an hour, so the refresh token is what
 * actually matters — it is stored encrypted and exchanged on demand.
 */

import { env } from '../lib/env.js';
import { AppError, badRequest, serviceUnavailable, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';

/**
 * Scopes requested at sign-in.
 *
 * `business.manage` covers Business Profile; `youtube.upload` covers Shorts.
 * Both are "sensitive" or "restricted" scopes, so the OAuth consent screen
 * needs Google's verification before anyone outside the project's test users
 * can grant them.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

/** One place every Google REST call goes through, so errors read the same. */
async function googleRequest<T>(
  url: string,
  accessToken: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } }).error?.message ?? `Google request failed (${response.status})`;
    if (response.status === 403 && /not been used|is disabled|accessNotConfigured|PERMISSION_DENIED/i.test(JSON.stringify(payload))) {
      throw new AppError(403, 'google_api_not_enabled', `Google has not enabled this API for the project yet: ${message}`);
    }
    throw new AppError(response.status === 401 ? 401 : 400, 'google_request_failed', message);
  }
  return payload as T;
}

function requireConfig(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw serviceUnavailable('Google integration is not configured on this server.');
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function redirectUri(): string {
  return `${env.APP_URL}/api/connections/google/callback`;
}

/**
 * The URL to send the user to.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google return a
 * refresh token; without both, a returning user gets only an access token that
 * dies in an hour and scheduled posting stops working.
 */
export function buildAuthUrl(state: string): string {
  const { clientId } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  grantedScopes: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function requestTokens(body: URLSearchParams): Promise<GoogleTokens> {
  const response = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json()) as TokenResponse;

  if (payload.error) {
    throw new AppError(
      400,
      'google_auth_failed',
      `Google rejected the sign-in: ${payload.error_description ?? payload.error}`,
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    grantedScopes: (payload.scope ?? '').split(' ').filter(Boolean),
  };
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireConfig();
  return requestTokens(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  );
}

/** Exchanges a stored refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireConfig();
  try {
    return await requestTokens(
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    );
  } catch (error) {
    // A revoked grant cannot be recovered by retrying; the user must reconnect.
    logger.warn({ err: error }, 'Google refresh token rejected');
    throw unauthorized('Google access has been revoked. Please reconnect the account.');
  }
}

export interface GoogleIdentity {
  id: string;
  email?: string;
  name?: string;
  pictureUrl?: string;
}

export async function getIdentity(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw badRequest('Could not read the Google account details.');

  const data = (await response.json()) as {
    id: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  return { id: data.id, email: data.email, name: data.name, pictureUrl: data.picture };
}

// --- Business Profile -----------------------------------------------------

export interface BusinessLocation {
  /** Resource name, e.g. `locations/12345`. Used for every later call. */
  name: string;
  title: string;
  storefrontAddress?: string;
  accountName: string;
}

/**
 * Lists the Business Profile locations this account manages.
 *
 * Locations hang off accounts, so both have to be walked. Returns an empty
 * list rather than throwing when the API is not yet approved, so the caller
 * can explain that clearly.
 */
export async function listBusinessLocations(accessToken: string): Promise<BusinessLocation[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const accountsResponse = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    { headers },
  );

  if (!accountsResponse.ok) {
    const detail = await accountsResponse.text();
    logger.warn({ status: accountsResponse.status, detail }, 'Business Profile accounts failed');
    if (accountsResponse.status === 403) {
      throw new AppError(
        403,
        'google_api_not_enabled',
        'Google has not granted this project access to the Business Profile API yet. ' +
          'The access request has to be approved before listings can be managed.',
      );
    }
    throw badRequest('Could not read Google Business Profile accounts.');
  }

  const accounts = (await accountsResponse.json()) as {
    accounts?: { name: string; accountName?: string }[];
  };

  const locations: BusinessLocation[] = [];
  for (const account of accounts.accounts ?? []) {
    const url = new URL(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`,
    );
    url.searchParams.set('readMask', 'name,title,storefrontAddress');
    url.searchParams.set('pageSize', '100');

    const response = await fetch(url, { headers });
    if (!response.ok) {
      logger.warn({ account: account.name, status: response.status }, 'Could not list locations');
      continue;
    }

    const data = (await response.json()) as {
      locations?: {
        name: string;
        title?: string;
        storefrontAddress?: { addressLines?: string[]; locality?: string };
      }[];
    };

    for (const location of data.locations ?? []) {
      locations.push({
        name: `${account.name}/${location.name}`,
        title: location.title ?? 'Untitled location',
        storefrontAddress: [
          ...(location.storefrontAddress?.addressLines ?? []),
          location.storefrontAddress?.locality,
        ]
          .filter(Boolean)
          .join(', '),
        accountName: account.accountName ?? account.name,
      });
    }
  }

  return locations;
}

// --- Business Profile: details, reviews, posts, media ----------------------

export interface LocationDetails {
  title: string;
  primaryCategory: string | null;
  additionalCategories: number;
  description: string;
  phone: string | null;
  website: string | null;
  hasHours: boolean;
  placeId: string | null;
  mapsUri: string | null;
  newReviewUri: string | null;
}

/** The parts of a listing that decide how complete it looks to Google. */
export async function getLocationDetails(accessToken: string, locationName: string): Promise<LocationDetails> {
  // Business Information takes the bare `locations/{id}` name.
  const bare = locationName.replace(/^accounts\/[^/]+\//, '');
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${bare}`);
  url.searchParams.set('readMask', 'name,title,categories,phoneNumbers,websiteUri,regularHours,profile,metadata');
  const data = await googleRequest<{
    title?: string;
    categories?: { primaryCategory?: { displayName?: string }; additionalCategories?: unknown[] };
    phoneNumbers?: { primaryPhone?: string };
    websiteUri?: string;
    regularHours?: { periods?: unknown[] };
    profile?: { description?: string };
    metadata?: { placeId?: string; mapsUri?: string; newReviewUri?: string };
  }>(url.toString(), accessToken);
  return {
    title: data.title ?? 'Untitled',
    primaryCategory: data.categories?.primaryCategory?.displayName ?? null,
    additionalCategories: data.categories?.additionalCategories?.length ?? 0,
    description: data.profile?.description ?? '',
    phone: data.phoneNumbers?.primaryPhone ?? null,
    website: data.websiteUri ?? null,
    hasHours: (data.regularHours?.periods?.length ?? 0) > 0,
    placeId: data.metadata?.placeId ?? null,
    mapsUri: data.metadata?.mapsUri ?? null,
    newReviewUri: data.metadata?.newReviewUri ?? null,
  };
}

export interface GoogleReview {
  name: string;
  reviewer: string;
  reviewerPhoto: string | null;
  rating: number;
  comment: string;
  createdAt: string;
  reply: { comment: string; updatedAt: string } | null;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function listReviews(
  accessToken: string,
  locationName: string,
): Promise<{ reviews: GoogleReview[]; averageRating: number; total: number }> {
  const url = new URL(`https://mybusiness.googleapis.com/v4/${locationName}/reviews`);
  url.searchParams.set('pageSize', '50');
  url.searchParams.set('orderBy', 'updateTime desc');
  const data = await googleRequest<{
    reviews?: {
      name: string;
      reviewer?: { displayName?: string; profilePhotoUrl?: string };
      starRating?: string;
      comment?: string;
      createTime?: string;
      reviewReply?: { comment?: string; updateTime?: string };
    }[];
    averageRating?: number;
    totalReviewCount?: number;
  }>(url.toString(), accessToken);
  return {
    reviews: (data.reviews ?? []).map((r) => ({
      name: r.name,
      reviewer: r.reviewer?.displayName ?? 'A Google user',
      reviewerPhoto: r.reviewer?.profilePhotoUrl ?? null,
      rating: STARS[r.starRating ?? ''] ?? 0,
      comment: r.comment ?? '',
      createdAt: r.createTime ?? new Date().toISOString(),
      reply: r.reviewReply?.comment ? { comment: r.reviewReply.comment, updatedAt: r.reviewReply.updateTime ?? '' } : null,
    })),
    averageRating: data.averageRating ?? 0,
    total: data.totalReviewCount ?? data.reviews?.length ?? 0,
  };
}

export async function replyToReview(accessToken: string, reviewName: string, comment: string): Promise<void> {
  await googleRequest(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, accessToken, {
    method: 'PUT',
    body: { comment },
  });
}

export interface LocalPostInput {
  summary: string;
  imageUrl?: string;
  /** A button on the post, with where it leads. */
  callToAction?: { type: 'LEARN_MORE' | 'BOOK' | 'ORDER' | 'SHOP' | 'SIGN_UP' | 'CALL'; url?: string };
}

/** Publishes an update to the listing. Returns the post's resource name. */
export async function createLocalPost(
  accessToken: string,
  locationName: string,
  input: LocalPostInput,
): Promise<{ name: string; searchUrl: string | null }> {
  const body: Record<string, unknown> = {
    languageCode: 'en',
    summary: input.summary.slice(0, 1500),
    topicType: 'STANDARD',
    ...(input.imageUrl ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: input.imageUrl }] } : {}),
    ...(input.callToAction
      ? { callToAction: { actionType: input.callToAction.type, ...(input.callToAction.url ? { url: input.callToAction.url } : {}) } }
      : {}),
  };
  const data = await googleRequest<{ name: string; searchUrl?: string }>(
    `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    accessToken,
    { method: 'POST', body },
  );
  return { name: data.name, searchUrl: data.searchUrl ?? null };
}

export async function latestLocalPostAt(accessToken: string, locationName: string): Promise<string | null> {
  const url = new URL(`https://mybusiness.googleapis.com/v4/${locationName}/localPosts`);
  url.searchParams.set('pageSize', '1');
  const data = await googleRequest<{ localPosts?: { createTime?: string }[] }>(url.toString(), accessToken);
  return data.localPosts?.[0]?.createTime ?? null;
}

export async function countMedia(accessToken: string, locationName: string): Promise<{ count: number; latestAt: string | null }> {
  const url = new URL(`https://mybusiness.googleapis.com/v4/${locationName}/media`);
  url.searchParams.set('pageSize', '100');
  const data = await googleRequest<{ mediaItems?: { createTime?: string }[]; totalMediaItemCount?: number }>(url.toString(), accessToken);
  const items = data.mediaItems ?? [];
  const latest = items.map((m) => m.createTime ?? '').filter(Boolean).sort().pop() ?? null;
  return { count: data.totalMediaItemCount ?? items.length, latestAt: latest };
}

// --- Search Console ----------------------------------------------------------

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const data = await googleRequest<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(
    'https://www.googleapis.com/webmasters/v3/sites',
    accessToken,
  );
  return (data.siteEntry ?? []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser');
}

export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function searchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 25,
): Promise<QueryRow[]> {
  const data = await googleRequest<{ rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    accessToken,
    { method: 'POST', body: { startDate, endDate, dimensions: ['query'], rowLimit } },
  );
  return (data.rows ?? []).map((r) => ({
    query: r.keys[0] ?? '',
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: Math.round(r.position * 10) / 10,
  }));
}

// --- Business Profile performance ---------------------------------------------

export interface LocationPerformance {
  impressionsMaps: number;
  impressionsSearch: number;
  calls: number;
  websiteClicks: number;
  directions: number;
}

const PERF_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
] as const;

/** Views, calls, website clicks and direction requests over a date range. */
export async function fetchLocationPerformance(
  accessToken: string,
  locationName: string,
  from: Date,
  to: Date,
): Promise<LocationPerformance> {
  const bare = locationName.replace(/^accounts\/[^/]+\//, '');
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/${bare}:fetchMultiDailyMetricsTimeSeries`);
  for (const m of PERF_METRICS) url.searchParams.append('dailyMetrics', m);
  url.searchParams.set('dailyRange.startDate.year', String(from.getUTCFullYear()));
  url.searchParams.set('dailyRange.startDate.month', String(from.getUTCMonth() + 1));
  url.searchParams.set('dailyRange.startDate.day', String(from.getUTCDate()));
  url.searchParams.set('dailyRange.endDate.year', String(to.getUTCFullYear()));
  url.searchParams.set('dailyRange.endDate.month', String(to.getUTCMonth() + 1));
  url.searchParams.set('dailyRange.endDate.day', String(to.getUTCDate()));
  const data = await googleRequest<{
    multiDailyMetricTimeSeries?: {
      dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { value?: string }[] } }[];
    }[];
  }>(url.toString(), accessToken);
  const totals: Record<string, number> = {};
  for (const group of data.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      totals[series.dailyMetric] = (series.timeSeries?.datedValues ?? []).reduce((s, v) => s + Number(v.value ?? 0), 0);
    }
  }
  const t = (k: string) => totals[k] ?? 0;
  return {
    impressionsMaps: t('BUSINESS_IMPRESSIONS_DESKTOP_MAPS') + t('BUSINESS_IMPRESSIONS_MOBILE_MAPS'),
    impressionsSearch: t('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH') + t('BUSINESS_IMPRESSIONS_MOBILE_SEARCH'),
    calls: t('CALL_CLICKS'),
    websiteClicks: t('WEBSITE_CLICKS'),
    directions: t('BUSINESS_DIRECTION_REQUESTS'),
  };
}

// --- Google Analytics 4 --------------------------------------------------------

export interface AnalyticsProperty {
  /** `properties/123456`. */
  name: string;
  displayName: string;
  account: string;
}

export async function listAnalyticsProperties(accessToken: string): Promise<AnalyticsProperty[]> {
  const data = await googleRequest<{
    accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[];
  }>('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', accessToken);
  const out: AnalyticsProperty[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const p of account.propertySummaries ?? []) {
      out.push({ name: p.property, displayName: p.displayName ?? p.property, account: account.displayName ?? '' });
    }
  }
  return out;
}

export interface AnalyticsSummary {
  sessions: number;
  users: number;
  keyEvents: number;
  engagementRate: number;
  channels: { channel: string; sessions: number }[];
  pages: { page: string; views: number }[];
}

async function runReport(
  accessToken: string,
  property: string,
  body: Record<string, unknown>,
): Promise<{ rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] }> {
  return googleRequest(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, accessToken, { method: 'POST', body });
}

export async function analyticsSummary(accessToken: string, property: string, startDate: string, endDate: string): Promise<AnalyticsSummary> {
  const range = [{ startDate, endDate }];
  const [totals, channels, pages] = await Promise.all([
    runReport(accessToken, property, { dateRanges: range, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'keyEvents' }, { name: 'engagementRate' }] }),
    runReport(accessToken, property, {
      dateRanges: range,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 6,
    }),
    runReport(accessToken, property, {
      dateRanges: range,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 8,
    }),
  ]);
  const m = totals.rows?.[0]?.metricValues ?? [];
  const n = (i: number) => Number(m[i]?.value ?? 0);
  return {
    sessions: n(0),
    users: n(1),
    keyEvents: n(2),
    engagementRate: Math.round(n(3) * 1000) / 10,
    channels: (channels.rows ?? []).map((r) => ({ channel: r.dimensionValues?.[0]?.value ?? '', sessions: Number(r.metricValues?.[0]?.value ?? 0) })),
    pages: (pages.rows ?? []).map((r) => ({ page: r.dimensionValues?.[0]?.value ?? '', views: Number(r.metricValues?.[0]?.value ?? 0) })),
  };
}

// --- Google Ads (reporting; campaign creation follows once the token is issued) --

export interface AdsCustomer {
  id: string;
  descriptiveName: string;
  currency: string;
}

function adsHeaders(accessToken: string, developerToken: string, loginCustomerId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId.replace(/-/g, '') } : {}),
    'Content-Type': 'application/json',
  };
}

const ADS_API = 'https://googleads.googleapis.com/v19';

export async function listAdsCustomers(accessToken: string, developerToken: string, loginCustomerId?: string): Promise<AdsCustomer[]> {
  const listed = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, { headers: adsHeaders(accessToken, developerToken, loginCustomerId) });
  if (!listed.ok) throw new AppError(400, 'google_ads_failed', `Google Ads: ${(await listed.text()).slice(0, 200)}`);
  const { resourceNames = [] } = (await listed.json()) as { resourceNames?: string[] };
  const customers: AdsCustomer[] = [];
  for (const name of resourceNames.slice(0, 20)) {
    const id = name.replace('customers/', '');
    try {
      const res = await fetch(`${ADS_API}/customers/${id}/googleAds:search`, {
        method: 'POST',
        headers: adsHeaders(accessToken, developerToken, loginCustomerId),
        body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1' }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: { customer?: { id?: string; descriptiveName?: string; currencyCode?: string } }[] };
      const c = data.results?.[0]?.customer;
      if (c?.id) customers.push({ id: String(c.id), descriptiveName: c.descriptiveName ?? `Account ${c.id}`, currency: c.currencyCode ?? 'INR' });
    } catch {
      /* a manager or inaccessible account; skip */
    }
  }
  return customers;
}

export interface AdsCampaignRow {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export async function adsCampaignReport(
  accessToken: string,
  developerToken: string,
  customerId: string,
  days: number,
  loginCustomerId?: string,
): Promise<AdsCampaignRow[]> {
  const res = await fetch(`${ADS_API}/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers: adsHeaders(accessToken, developerToken, loginCustomerId),
    body: JSON.stringify({
      query: `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_${days === 7 ? '7' : '30'}_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 25`,
    }),
  });
  if (!res.ok) throw new AppError(400, 'google_ads_failed', `Google Ads: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { results?: { campaign?: { id?: string; name?: string; status?: string }; metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number } }[] };
  return (data.results ?? []).map((r) => ({
    id: String(r.campaign?.id ?? ''),
    name: r.campaign?.name ?? '',
    status: r.campaign?.status ?? '',
    impressions: Number(r.metrics?.impressions ?? 0),
    clicks: Number(r.metrics?.clicks ?? 0),
    costMicros: Number(r.metrics?.costMicros ?? 0),
    conversions: Number(r.metrics?.conversions ?? 0),
  }));
}
