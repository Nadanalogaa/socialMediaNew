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
};
