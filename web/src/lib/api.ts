/**
 * API client.
 *
 * Holds the session in localStorage and transparently retries once through the
 * refresh endpoint when an access token has expired, so the UI never has to
 * think about 15-minute token lifetimes.
 */

/**
 * Two independent sessions: the app's and the admin module's. Signing in to
 * one never signs you in to the other, and each is kept under its own key.
 * The scope follows the URL: /admin uses the admin session.
 */
const SESSION_KEYS = { app: 'socialboost.session', admin: 'socialboost.admin-session' } as const;
export type SessionScope = keyof typeof SESSION_KEYS;
let sessionScope: SessionScope = window.location.pathname.startsWith('/admin') ? 'admin' : 'app';

export function setSessionScope(scope: SessionScope): void {
  sessionScope = scope;
}
export function getSessionScope(): SessionScope {
  return sessionScope;
}
const SESSION_KEY = () => SESSION_KEYS[sessionScope];

/** Endpoints that legitimately run without a session. */
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/organizations/invitations/'];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; isPlatformAdmin?: boolean };
  /** The workspace currently in view; every request is scoped to it. */
  organization: Organization;
  /** Every workspace this user can switch between. */
  organizations?: Organization[];
}

/** Switches the active workspace, so subsequent requests are scoped to it. */
export function setActiveOrganization(session: Session, organization: Organization): Session {
  const next: Session = { ...session, organization };
  saveSession(next);
  return next;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY());
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY(), JSON.stringify(session));
  } catch {
    /* Private browsing can reject writes; the session still works in memory. */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY());
  } catch {
    /* ignore */
  }
}

/**
 * Notifies the app when a session ends on its own — an expired refresh token,
 * or a request that arrived unauthenticated. Without this the UI keeps showing
 * a signed-in dashboard whose every action fails with "Authentication
 * required", which looks like a broken feature rather than a finished session.
 */
type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionExpired(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function announceSessionExpired(): void {
  clearSession();
  for (const listener of sessionListeners) listener();
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'error';
  let message = `Request failed (${response.status})`;
  let details: { field: string; message: string }[] | undefined;
  try {
    const body = await response.json();
    code = body?.error?.code ?? code;
    message = body?.error?.message ?? message;
    details = body?.error?.details;
  } catch {
    /* Non-JSON error body; keep the status-based message. */
  }
  return new ApiError(response.status, code, message, details);
}

async function rawRequest(path: string, init: RequestInit, session: Session | null) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
    headers.set('X-Organization-Id', session.organization.id);
  }
  return fetch(`/api${path}`, { ...init, headers });
}

/**
 * Performs a request, refreshing the session once on 401 before giving up.
 * Returns the parsed body, or throws an ApiError the UI can render.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = loadSession();

  // The stored session is gone but the UI still thinks it is signed in.
  if (!session && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    announceSessionExpired();
    throw new ApiError(401, 'unauthorized', 'Your session has ended. Please sign in again.');
  }

  let response = await rawRequest(path, init, session);

  if (response.status === 401 && session) {
    const refreshed = await tryRefresh(session.refreshToken);
    if (!refreshed) {
      announceSessionExpired();
      throw new ApiError(401, 'unauthorized', 'Your session expired. Please sign in again.');
    }
    saveSession(refreshed);
    session = refreshed;
    response = await rawRequest(path, init, session);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function tryRefresh(refreshToken: string): Promise<Session | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    return response.ok ? ((await response.json()) as Session) : null;
  } catch {
    return null;
  }
}

// --- Resource types -------------------------------------------------------

export interface Connection {
  id: string;
  provider: string;
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  lastError: string | null;
  /** When the stored token runs out; null for tokens that do not expire. */
  tokenExpiresAt: string | null;
  /** When we last asked Meta whether the token still works. */
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface ConnectionHealth {
  id: string;
  displayName: string;
  provider: string;
  status: 'active' | 'expired' | 'error';
  lastError: string | null;
  checkedAt: string;
}

export interface AvailablePage {
  id: string;
  name: string;
  category?: string;
  pictureUrl?: string;
  instagram: { id: string; username: string } | null;
}

export interface MediaAsset {
  id: string;
  kind: 'image' | 'video';
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface PostTarget {
  id: string;
  connectionId: string;
  provider: string;
  /** Per-channel caption; null means the shared caption is used. */
  caption: string | null;
  status: string;
  externalPostId: string | null;
  permalink: string | null;
  error: string | null;
  publishedAt: string | null;
  firstCommentId: string | null;
  firstCommentError: string | null;
}

export interface PostMedia {
  id: string;
  kind: 'image' | 'video';
  url: string;
  thumbnailUrl: string | null;
}

export interface Post {
  id: string;
  caption: string;
  hashtags: string[];
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  reviewNote: string | null;
  firstComment: string | null;
  repeatEveryDays: number | null;
  repeatUntil: string | null;
  parentPostId: string | null;
  createdAt: string;
  targets: PostTarget[];
  media: PostMedia[];
}

export interface HashtagGroup {
  id: string;
  name: string;
  tags: string[];
}

export interface PostingSlot {
  days: number[];
  time: string;
}

export interface OrganizationSettings {
  timezone: string;
  postingSlots: PostingSlot[];
  requireApproval: boolean;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  link: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface InvitationPreview {
  organizationName: string;
  role: string;
  email: string;
  inviter: string;
  accepted: boolean;
  expired: boolean;
}

export interface BillingOrder {
  id: string;
  planCode: string;
  interval: 'monthly' | 'yearly';
  amountInPaise: number;
  status: 'created' | 'paid' | 'failed';
  razorpayPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface BillingInfo {
  plan: { code: string; name: string; priceInPaise: number; yearlyPriceInPaise: number; tagline: string; highlights: string[]; limits: Record<string, number> };
  source: 'subscription' | 'manual' | 'trial' | 'free';
  endsAt: string | null;
  trialEndsAt: string | null;
  suspended: boolean;
  usage: Record<string, { used: number; limit: number }>;
  orders: BillingOrder[];
  paymentsEnabled: boolean;
  razorpayKeyId: string | null;
}

export interface AdminOverview {
  organizations: number;
  newOrganizations30d: number;
  users: number;
  activeSubscriptions: number;
  trialing: number;
  mrrInPaise: number;
  revenue30dInPaise: number;
  postsPublished30d: number;
  postsFailed7d: number;
  tokensExpiring7d: number;
  queue: Record<string, number> | null;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  planCode: string;
  planSource: string;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  members: number;
  channels: number;
  posts30d: number;
  lastActivity: string | null;
  ownerEmail: string | null;
  periodEnd: string | null;
  effectivePlan: { code: string; source: string };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  workspaces: number;
  workspaceNames: string | null;
}

export interface AdminPayment {
  id: string;
  organizationId: string;
  organizationName: string;
  planCode: string;
  interval: string;
  amountInPaise: number;
  status: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InboxComment {
  id: string;
  message: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  fromUs: boolean;
}

export interface InboxThread {
  targetId: string;
  postId: string;
  provider: string;
  channelName: string;
  caption: string;
  permalink: string | null;
  publishedAt: string | null;
  comments: InboxComment[];
  unanswered: boolean;
  error: string | null;
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

export interface GoogleScoreItem {
  key: string;
  label: string;
  points: number;
  earned: number;
  ok: boolean;
  fix: string;
}

export interface Nudge {
  key: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  tab: 'posts' | 'compose' | 'channels' | 'google' | 'reels' | 'brand' | 'inbox';
}

export interface KeywordSuggestion {
  phrase: string;
  source: 'search' | 'category';
  position?: number;
  clicks?: number;
  impressions?: number;
}

export interface CompetitorSnapshot {
  connectionId: string;
  query: string;
  you: { name: string; rating: number | null; reviews: number; photos: number; website: boolean } | null;
  competitors: { placeId: string; name: string; rating: number | null; reviews: number; photos: number; website: boolean; mapsUri: string | null }[];
  notes: string[];
  error: string | null;
}

export interface GoogleLocationReport {
  connectionId: string;
  title: string;
  address: string | null;
  category: string | null;
  locality: string | null;
  mapsUri: string | null;
  reviewUri: string | null;
  score: number;
  items: GoogleScoreItem[];
  reviews: { average: number; total: number; unanswered: number; recent: GoogleReview[] };
  performance: { current: GooglePerformance; previous: GooglePerformance } | null;
  error: string | null;
}

export interface GooglePerformance {
  impressionsMaps: number;
  impressionsSearch: number;
  calls: number;
  websiteClicks: number;
  directions: number;
}

export interface GoogleAnalyticsSummary {
  sessions: number;
  users: number;
  keyEvents: number;
  engagementRate: number;
  channels: { channel: string; sessions: number }[];
  pages: { page: string; views: number }[];
}

export interface GoogleAnalyticsReport {
  connectionId: string;
  property: string;
  period: { from: string; to: string };
  current: GoogleAnalyticsSummary | null;
  previous: GoogleAnalyticsSummary | null;
  tag: { measurementId: string; siteUrl: string; installed: boolean | null } | null;
  error: string | null;
}

export interface GoogleAdsReport {
  connectionId: string;
  account: string;
  currency: string;
  campaigns: { id: string; name: string; status: string; impressions: number; clicks: number; costMicros: number; conversions: number }[];
  totals: { impressions: number; clicks: number; costMicros: number; conversions: number };
  error: string | null;
}

export interface GoogleSiteReport {
  connectionId: string;
  site: string;
  period: { from: string; to: string };
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number; previousPosition: number | null; change: number | null }[];
  totals: { clicks: number; impressions: number; previousClicks: number };
  error: string | null;
}

export interface GoogleOverview {
  configured: boolean;
  ai: boolean;
  places: boolean;
  connected: boolean;
  account: { name: string; email: string | null } | null;
  locations: GoogleLocationReport[];
  sites: GoogleSiteReport[];
  analytics: GoogleAnalyticsReport[];
  ads: GoogleAdsReport[];
  adsEnabled: boolean;
}

export interface ReportPayload extends AnalyticsPayload {
  audience: { connectionId: string; displayName: string; provider: string; followers: number | null }[];
  google: {
    locations: { title: string; score: number; reviews: { average: number; total: number; unanswered: number }; performance: { current: GooglePerformance; previous: GooglePerformance } | null; error: string | null }[];
    sites: { site: string; totals: { clicks: number; impressions: number; previousClicks: number }; top: { query: string; position: number; clicks: number }[]; error: string | null }[];
    analytics: { property: string; current: GoogleAnalyticsSummary | null; previous: GoogleAnalyticsSummary | null; error: string | null }[];
    ads: { account: string; currency: string; totals: { impressions: number; clicks: number; costMicros: number; conversions: number }; campaigns: { name: string; clicks: number; costMicros: number; conversions: number }[]; error: string | null }[];
  } | null;
  brand: { name: string; logoUrl: string | null; primaryColor: string | null; website: string | null };
  generatedAt: string;
}

export interface BrandKit {
  name: string;
  tagline: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
  signature: string | null;
  defaultHashtags: string[];
  description: string | null;
  toneOfVoice: string | null;
  targetAudience: string | null;
  industry: string | null;
}

export interface Idea {
  id: string;
  title: string;
  notes: string | null;
  url: string | null;
  status: 'open' | 'done';
  createdAt: string;
  media: { id: string; kind: 'image' | 'video'; url: string; thumbnailUrl: string | null } | null;
}

export interface SlotSuggestion {
  at: string;
  label: string;
}

export interface BestTimesReport {
  basis: 'history' | 'default';
  timezone: string;
  times: { weekday: number; hour: number; label: string; score: number; samples: number }[];
}

export interface SavedBrief {
  id: string;
  name: string;
  brief: string;
  scenePhotos: Record<string, string | string[]>;
  options: {
    photoLayout?: Record<string, 'background' | 'blocks'>;
    logo?: string;
    logoPosition?: string;
    /** The plain description the story was written from, if it was. */
    description?: string;
  };
  brandColor: string;
  accentColor: string;
  updatedAt: string;
}

export interface StockPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
  source: 'pixabay' | 'pexels';
}

export interface MagicStoryPhotoScene {
  index: number;
  query: string;
  /** Already imported into the library, when a stock photo was found. */
  chosen: MediaAsset | null;
  alternatives: StockPhoto[];
}

export interface MagicStory {
  title: string;
  language: string;
  brief: string;
  needs: { photoScenes: number[] };
  photoScenes: MagicStoryPhotoScene[];
}

export interface DesignSummary {
  id: string;
  name: string;
  kind: 'image' | 'video';
  ratio: string;
  shortDescription: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  previewUrl: string | null;
  updatedAt: string;
}

/** Uploads an audio file; Cloudinary stores these under its video resource type. */
export async function uploadAudio(
  file: File,
  signature: UploadSignature,
): Promise<{ url: string; publicId: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/video/upload`,
    { method: 'POST', body: form },
  );
  if (!response.ok) throw new Error('Could not upload that audio file.');
  const body = await response.json();
  return { url: body.secure_url, publicId: body.public_id };
}

export interface AnalyticsPayload {
  summary: {
    posts: { published: number; scheduled: number; failed: number };
    engagement: { likes: number; comments: number; shares: number; total: number };
    channels: number;
  };
  timeseries: { date: string; posts: number; engagement: number }[];
  channels: {
    connectionId: string;
    displayName: string;
    provider: string;
    posts: number;
    engagement: number;
  }[];
  topPosts: {
    postId: string;
    caption: string;
    publishedAt: string | null;
    engagement: number;
    permalink: string | null;
  }[];
  days: number;
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export interface ServerFeatures {
  ai: boolean;
  meta: boolean;
  cloudinary: boolean;
  billing: boolean;
  stockPhotos?: boolean;
}

/** Cached for the session: configuration does not change between requests. */
let featuresPromise: Promise<ServerFeatures> | null = null;

export function getFeatures(): Promise<ServerFeatures> {
  featuresPromise ??= fetch('/api/config')
    .then((r) => r.json())
    .then((body: { features: ServerFeatures }) => body.features)
    .catch(() => ({ ai: false, meta: false, cloudinary: false, billing: false }));
  return featuresPromise;
}

export const api = {
  register: (input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) => request<Session>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  login: (input: { email: string; password: string }) =>
    request<Session>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  // --- Workspaces ---
  listOrganizations: () => request<{ organizations: Organization[] }>('/organizations'),

  createOrganization: (name: string) =>
    request<Organization>('/organizations', { method: 'POST', body: JSON.stringify({ name }) }),

  // --- Connections ---
  listConnections: () => request<{ connections: Connection[] }>('/connections'),

  beginMetaConnection: (userAccessToken: string) =>
    request<{ handle: string; pages: AvailablePage[] }>('/connections/meta/begin', {
      method: 'POST',
      body: JSON.stringify({ userAccessToken }),
    }),

  completeMetaConnection: (handle: string, pageIds: string[]) =>
    request<{ connected: number }>('/connections/meta/complete', {
      method: 'POST',
      body: JSON.stringify({ handle, pageIds }),
    }),

  disconnect: (id: string) => request<void>(`/connections/${id}`, { method: 'DELETE' }),

  // --- Media ---
  uploadSignature: () =>
    request<UploadSignature>('/media/upload-signature', { method: 'POST' }),

  listMedia: () => request<{ media: MediaAsset[] }>('/media'),

  registerMedia: (input: {
    kind: 'image' | 'video';
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    bytes?: number;
    providerRef?: string;
  }) => request<MediaAsset>('/media', { method: 'POST', body: JSON.stringify(input) }),

  // --- Saved designs ---
  listDesigns: (params: { kind?: string; tag?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<{ designs: DesignSummary[]; tags: string[] }>(
      `/creatives/designs${query ? `?${query}` : ''}`,
    );
  },

  saveDesign: (input: {
    id?: string;
    name: string;
    kind: 'image' | 'video';
    ratio: string;
    document: Record<string, unknown>;
    shortDescription?: string;
    description?: string;
    tags?: string[];
    renderedAssetId?: string;
  }) => request<{ id: string }>('/creatives/designs', {
    method: 'POST',
    body: JSON.stringify(input),
  }),

  getDesign: (id: string) =>
    request<{ id: string; name: string; document: Record<string, unknown> }>(
      `/creatives/designs/${id}`,
    ),

  deleteDesign: (id: string) =>
    request<void>(`/creatives/designs/${id}`, { method: 'DELETE' }),

  // --- Magic Design briefs ---
  listBriefs: () => request<{ briefs: SavedBrief[] }>('/creatives/briefs'),

  saveBrief: (input: {
    id?: string;
    name: string;
    brief: string;
    scenePhotos: Record<string, string[]>;
    options: SavedBrief['options'];
    brandColor: string;
    accentColor: string;
  }) => request<SavedBrief>('/creatives/briefs', { method: 'POST', body: JSON.stringify(input) }),

  deleteBrief: (id: string) => request<void>(`/creatives/briefs/${id}`, { method: 'DELETE' }),

  writeMagicStory: (input: {
    description: string;
    sceneCount?: number;
    language?: string;
    currentBrief?: string;
    instruction?: string;
  }) => request<MagicStory>('/creatives/magic/story', { method: 'POST', body: JSON.stringify(input) }),

  searchStockPhotos: (query: string, page = 1) =>
    request<{ photos: StockPhoto[]; configured: boolean }>('/creatives/magic/photos', {
      method: 'POST',
      body: JSON.stringify({ query, page }),
    }),

  pickStockPhoto: (photo: StockPhoto) =>
    request<MediaAsset>('/creatives/magic/photos/pick', {
      method: 'POST',
      body: JSON.stringify({
        id: photo.id,
        url: photo.url,
        width: photo.width,
        height: photo.height,
        photographer: photo.photographer,
        photographerUrl: photo.photographerUrl,
        alt: photo.alt,
        source: photo.source,
      }),
    }),

  // --- Analytics ---
  getAnalytics: (days: number) => request<AnalyticsPayload>(`/analytics?days=${days}`),

  refreshAnalytics: () => request<{ queued: boolean }>('/analytics/refresh', { method: 'POST' }),

  // --- Creatives ---
  autofillTemplate: (templateSlug: string, brief: string) =>
    request<{ values: Record<string, string> }>('/creatives/autofill', {
      method: 'POST',
      body: JSON.stringify({ templateSlug, brief }),
    }),

  generateCaption: (brief: string, providers: string[]) =>
    request<{ caption: string; hashtags: string[] }>('/creatives/caption', {
      method: 'POST',
      body: JSON.stringify({ brief, providers }),
    }),

  // --- Posts ---
  listPosts: (limit = 50) => request<{ posts: Post[] }>(`/posts?limit=${limit}`),

  calendarPosts: (from: Date, to: Date) =>
    request<{ posts: Post[] }>(
      `/posts/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    ),

  getPost: (id: string) => request<Post>(`/posts/${id}`),

  createPost: (input: {
    caption: string;
    hashtags: string[];
    mediaAssetIds: string[];
    targets: { connectionId: string; caption?: string }[];
    scheduledAt?: string;
    firstComment?: string;
    repeatEveryDays?: number;
    repeatUntil?: string;
    /** Defaults to true on the server; publishing is always deliberate. */
    asDraft?: boolean;
  }) => request<Post>('/posts', { method: 'POST', body: JSON.stringify(input) }),

  updatePost: (
    id: string,
    input: {
      caption?: string;
      hashtags?: string[];
      mediaAssetIds?: string[];
      targets?: { connectionId: string; caption?: string }[];
      /** null cancels a schedule (back to draft); a date (re)schedules. */
      scheduledAt?: string | null;
      firstComment?: string | null;
      repeatEveryDays?: number | null;
      repeatUntil?: string | null;
    },
  ) => request<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  publishPost: (id: string, scheduledAt?: string) =>
    request<Post>(`/posts/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(scheduledAt ? { scheduledAt } : {}),
    }),

  duplicatePost: (id: string) => request<Post>(`/posts/${id}/duplicate`, { method: 'POST' }),

  submitPost: (id: string) => request<Post>(`/posts/${id}/submit`, { method: 'POST' }),
  approvePost: (id: string) => request<Post>(`/posts/${id}/approve`, { method: 'POST' }),
  rejectPost: (id: string, note?: string) =>
    request<Post>(`/posts/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  deletePost: (id: string) => request<void>(`/posts/${id}`, { method: 'DELETE' }),

  nextSlots: (count = 5) => request<{ slots: SlotSuggestion[] }>(`/posts/next-slots?count=${count}`),

  bestTimes: () => request<BestTimesReport>('/posts/best-times'),

  listHashtagGroups: () => request<{ groups: HashtagGroup[] }>('/posts/hashtag-groups'),

  saveHashtagGroup: (input: { name: string; tags: string[] }) =>
    request<HashtagGroup>('/posts/hashtag-groups', { method: 'POST', body: JSON.stringify(input) }),

  deleteHashtagGroup: (id: string) =>
    request<void>(`/posts/hashtag-groups/${id}`, { method: 'DELETE' }),

  // --- Brand kit ---
  getBrand: () => request<BrandKit>('/organizations/current/brand'),

  updateBrand: (input: Partial<BrandKit>) =>
    request<BrandKit>('/organizations/current/brand', { method: 'PATCH', body: JSON.stringify(input) }),

  // --- Ideas ---
  listIdeas: () => request<{ ideas: Idea[] }>('/ideas'),

  createIdea: (input: { title: string; notes?: string; url?: string; mediaAssetId?: string | null }) =>
    request<{ id: string }>('/ideas', { method: 'POST', body: JSON.stringify(input) }),

  updateIdea: (id: string, input: Partial<{ title: string; notes: string | null; url: string | null; mediaAssetId: string | null; status: 'open' | 'done' }>) =>
    request<{ id: string }>(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteIdea: (id: string) => request<void>(`/ideas/${id}`, { method: 'DELETE' }),

  // --- Team ---
  listMembers: () => request<{ members: Member[] }>('/organizations/current/members'),
  setMemberRole: (userId: string, role: string) =>
    request<{ members: Member[] }>(`/organizations/current/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (userId: string) =>
    request<{ members: Member[] }>(`/organizations/current/members/${userId}`, { method: 'DELETE' }),
  listInvitations: () => request<{ invitations: Invitation[] }>('/organizations/current/invitations'),
  createInvitation: (input: { email: string; role: string }) =>
    request<Invitation>('/organizations/current/invitations', { method: 'POST', body: JSON.stringify(input) }),
  deleteInvitation: (id: string) =>
    request<void>(`/organizations/current/invitations/${id}`, { method: 'DELETE' }),
  previewInvitation: (token: string) =>
    request<InvitationPreview>(`/organizations/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) =>
    request<Organization>(`/organizations/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' }),

  // --- Billing ---
  getBilling: () => request<BillingInfo>('/billing'),
  startCheckout: (planCode: string, interval: 'monthly' | 'yearly') =>
    request<{ orderId: string; amountInPaise: number; currency: string; keyId: string; planName: string }>(
      '/billing/checkout',
      { method: 'POST', body: JSON.stringify({ planCode, interval }) },
    ),
  verifyPayment: (input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    request<BillingInfo>('/billing/verify', { method: 'POST', body: JSON.stringify(input) }),

  // --- Platform admin ---
  adminOverview: () => request<AdminOverview>('/admin/overview'),
  adminOrganizations: (q = '') =>
    request<{ organizations: AdminOrganization[] }>(`/admin/organizations${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminOrganization: (id: string) =>
    request<{
      organization: { id: string; name: string; slug: string; planCode: string; planSource: string; trialEndsAt: string | null; suspendedAt: string | null; createdAt: string };
      plan: { plan: { code: string; name: string }; source: string; endsAt: string | null };
      usage: { limits: Record<string, number>; usage: Record<string, { used: number; limit: number }> };
      members: { userId: string; name: string; email: string; role: string; lastLoginAt: string | null }[];
      channels: { id: string; provider: string; displayName: string; status: string; tokenExpiresAt: string | null; lastError: string | null }[];
      recentPosts: { id: string; caption: string; status: string; createdAt: string; publishedAt: string | null }[];
      orders: BillingOrder[];
      audit: { id: string; action: string; createdAt: string; metadata: Record<string, unknown> | null }[];
    }>(`/admin/organizations/${id}`),
  adminPatchOrganization: (id: string, input: { planCode?: string; extendTrialDays?: number; suspended?: boolean; note?: string }) =>
    request<{ plan: { plan: { code: string }; source: string } }>(`/admin/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  adminImpersonate: (id: string) => request<Session>(`/admin/organizations/${id}/impersonate`, { method: 'POST' }),
  adminPayments: () => request<{ payments: AdminPayment[] }>('/admin/payments'),
  adminUsers: (q = '') => request<{ users: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminSetPlatformAdmin: (id: string, isPlatformAdmin: boolean) =>
    request<{ id: string; isPlatformAdmin: boolean }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isPlatformAdmin }) }),

  startGoogleConnection: () => request<{ authUrl: string }>('/connections/google/start', { method: 'POST' }),

  // --- Google promotion ---
  getGoogleOverview: () => request<GoogleOverview>('/google/overview'),
  getKeywords: () => request<{ keywords: KeywordSuggestion[]; basis: string[] }>('/google/keywords'),
  getCompetitors: (connectionId: string) => request<CompetitorSnapshot>(`/google/competitors/${connectionId}`),
  suggestReviewReply: (input: { reviewer: string; rating: number; comment: string }) =>
    request<{ reply: string }>('/google/reviews/suggest', { method: 'POST', body: JSON.stringify(input) }),
  suggestCommentReply: (input: { authorName: string; message: string; postCaption: string }) =>
    request<{ reply: string }>('/inbox/suggest', { method: 'POST', body: JSON.stringify(input) }),
  getNudges: () => request<{ nudges: Nudge[] }>('/nudges'),
  replyToReview: (input: { connectionId: string; reviewName: string; comment: string }) =>
    request<{ ok: boolean }>('/google/reviews/reply', { method: 'POST', body: JSON.stringify(input) }),

  checkConnections: () => request<{ results: ConnectionHealth[] }>('/connections/check', { method: 'POST' }),
  checkConnection: (id: string) => request<ConnectionHealth>(`/connections/${id}/check`, { method: 'POST' }),

  // --- Inbox ---
  getInbox: (days = 30, refresh = false) =>
    request<{ threads: InboxThread[]; cachedAt: string }>(`/inbox?days=${days}${refresh ? '&refresh=1' : ''}`),
  replyToComment: (input: { targetId: string; commentId: string; message: string }) =>
    request<{ id: string }>('/inbox/reply', { method: 'POST', body: JSON.stringify(input) }),

  // --- Home ---
  getHome: () =>
    request<{
      attention: {
        failed: { id: string; caption: string; status: string; updatedAt: string }[];
        expiring: { id: string; displayName: string; provider: string; status: string; tokenExpiresAt: string | null }[];
        pending: { id: string; caption: string; updatedAt: string; scheduledAt: string | null }[];
      };
      runway: { scheduledCount: number; daysCovered: number; lastScheduled: string | null; next: { id: string; caption: string; scheduledAt: string }[] };
      recap: { thisWeek: { published: number; engagement: number }; lastWeek: { published: number; engagement: number } };
      heatmap: { date: string; count: number }[];
      topPosts: { postId: string; caption: string; publishedAt: string | null; engagement: number; permalink: string | null }[];
      bestTimes: BestTimesReport;
    }>('/analytics/home'),

  // --- Report ---
  getReport: (days: number) => request<ReportPayload>(`/analytics/report?days=${days}`),

  // --- Organisation settings ---
  getSettings: () => request<OrganizationSettings>('/organizations/current/settings'),

  updateSettings: (input: Partial<OrganizationSettings>) =>
    request<OrganizationSettings>('/organizations/current/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

/**
 * Uploads a file straight to Cloudinary using a server-issued signature.
 * The bytes never pass through our API, so large videos do not tie up a
 * request handler.
 */
export async function uploadToCloudinary(
  file: File,
  signature: UploadSignature,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; publicId: string; width?: number; height?: number }> {
  const isVideo = file.type.startsWith('video/');
  const endpoint = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${
    isVideo ? 'video' : 'image'
  }/upload`;

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);

  // XHR rather than fetch: fetch still cannot report upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `Upload failed (${xhr.status})`;
        try {
          message = JSON.parse(xhr.responseText)?.error?.message ?? message;
        } catch {
          /* keep the status message */
        }
        reject(new Error(message));
        return;
      }
      const body = JSON.parse(xhr.responseText);
      resolve({
        url: body.secure_url,
        publicId: body.public_id,
        width: body.width,
        height: body.height,
      });
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed. Check your connection.')));
    xhr.send(form);
  });
}
