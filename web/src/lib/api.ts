/**
 * API client.
 *
 * Holds the session in localStorage and transparently retries once through the
 * refresh endpoint when an access token has expired, so the UI never has to
 * think about 15-minute token lifetimes.
 */

const SESSION_KEY = 'socialboost.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string; role: string };
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
  let response = await rawRequest(path, init, session);

  if (response.status === 401 && session) {
    const refreshed = await tryRefresh(session.refreshToken);
    if (!refreshed) {
      clearSession();
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
  provider: string;
  status: string;
  externalPostId: string | null;
  permalink: string | null;
  error: string | null;
  publishedAt: string | null;
}

export interface Post {
  id: string;
  caption: string;
  hashtags: string[];
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  targets: PostTarget[];
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
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
    bytes?: number;
    providerRef?: string;
  }) => request<MediaAsset>('/media', { method: 'POST', body: JSON.stringify(input) }),

  // --- Posts ---
  listPosts: () => request<{ posts: Post[] }>('/posts'),

  createPost: (input: {
    caption: string;
    hashtags: string[];
    mediaAssetIds: string[];
    targets: { connectionId: string; caption?: string }[];
    scheduledAt?: string;
  }) => request<Post>('/posts', { method: 'POST', body: JSON.stringify(input) }),

  deletePost: (id: string) => request<void>(`/posts/${id}`, { method: 'DELETE' }),
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
