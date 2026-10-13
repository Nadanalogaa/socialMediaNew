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
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

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
