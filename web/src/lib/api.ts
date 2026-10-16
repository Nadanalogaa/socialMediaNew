/**
 * API client.
 *
 * Holds the session in localStorage and transparently retries once through the
 * refresh endpoint when an access token has expired, so the UI never has to
 * think about 15-minute token lifetimes.
 */

const SESSION_KEY = 'socialboost.session';

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
  user: { id: string; email: string; name: string };
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
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* Private browsing can reject writes; the session still works in memory. */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
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
  createdAt: string;
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

export interface ReportPayload extends AnalyticsPayload {
  audience: { connectionId: string; displayName: string; provider: string; followers: number | null }[];
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
  };
  brandColor: string;
  accentColor: string;
  updatedAt: string;
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
