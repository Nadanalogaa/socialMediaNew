/**
 * Connecting a Google account.
 *
 * Google redirects the browser back to us, so the callback cannot carry a
 * bearer token. The tenant identity travels in the `state` parameter, held in
 * Redis for a few minutes and checked on return — which is also what stops a
 * forged callback attaching someone else's Google account to a workspace.
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections } from '../../db/schema.js';
import { decryptToken, encryptToken } from '../../lib/crypto.js';
import { badRequest } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { connection as redis } from '../../queue/index.js';
import * as google from '../../integrations/google.js';
import { env } from '../../lib/env.js';

/** Long enough to sign in and choose an account, short enough to be useless if leaked. */
const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `google:oauth:${state}`;

export async function startGoogleConnection(
  organizationId: string,
  userId: string,
): Promise<{ authUrl: string }> {
  const state = randomUUID();
  // Built first: an unconfigured integration is reported at once, before
  // anything is written anywhere.
  const authUrl = google.buildAuthUrl(state);
  await redis.setex(stateKey(state), STATE_TTL_SECONDS, JSON.stringify({ organizationId, userId }));
  return { authUrl };
}

export interface GoogleConnectResult {
  organizationId: string;
  accountEmail?: string;
  locationsFound: number;
  sitesFound: number;
  propertiesFound: number;
  adsFound: number;
  businessProfileAvailable: boolean;
  message?: string;
}

/**
 * Completes the OAuth round trip.
 *
 * The Google account itself is stored as a connection even when no Business
 * Profile locations come back: the refresh token is what YouTube needs too,
 * and Business Profile access may simply not be approved yet.
 */
export async function completeGoogleConnection(
  code: string,
  state: string,
): Promise<GoogleConnectResult> {
  const raw = await redis.get(stateKey(state));
  if (!raw) throw badRequest('This Google sign-in expired or was not started here.');
  await redis.del(stateKey(state));

  const { organizationId } = JSON.parse(raw) as { organizationId: string; userId: string };

  const tokens = await google.exchangeCode(code);
  const identity = await google.getIdentity(tokens.accessToken);

  if (!tokens.refreshToken) {
    // Without a refresh token the connection dies in an hour, so refuse it
    // rather than storing something that will silently stop working.
    throw badRequest(
      'Google did not return a refresh token. Remove this app from your Google account ' +
        'permissions and connect again so the consent screen is shown in full.',
    );
  }

  let locations: google.BusinessLocation[] = [];
  let businessProfileAvailable = true;
  let message: string | undefined;

  try {
    locations = await google.listBusinessLocations(tokens.accessToken);
  } catch (error) {
    businessProfileAvailable = false;
    message = error instanceof Error ? error.message : 'Business Profile is unavailable.';
    logger.warn({ organizationId, err: error }, 'Business Profile listing unavailable');
  }

  for (const location of locations) {
    await upsert({
      organizationId,
      provider: 'google_business',
      externalId: location.name,
      displayName: location.title,
      tokens,
      metadata: { address: location.storefrontAddress, account: location.accountName },
    });
  }

  // Search Console properties: the queries the website ranks for.
  let sitesFound = 0;
  try {
    const sites = await google.listSearchConsoleSites(tokens.accessToken);
    for (const site of sites) {
      await upsert({
        organizationId,
        provider: 'google_search_console',
        externalId: site.siteUrl,
        displayName: site.siteUrl.replace(/^sc-domain:/, '').replace(/\/$/, ''),
        tokens,
        metadata: { permissionLevel: site.permissionLevel },
      });
      sitesFound++;
    }
  } catch (error) {
    logger.warn({ organizationId, err: error }, 'Search Console listing unavailable');
  }

  // Google Analytics 4 properties: what visitors do on the website.
  let propertiesFound = 0;
  try {
    for (const p of await google.listAnalyticsProperties(tokens.accessToken)) {
      await upsert({
        organizationId,
        provider: 'google_analytics',
        externalId: p.name,
        displayName: p.displayName,
        tokens,
        metadata: { account: p.account },
      });
      propertiesFound++;
    }
  } catch (error) {
    logger.warn({ organizationId, err: error }, 'Analytics listing unavailable');
  }

  // Google Ads accounts, once the developer token exists.
  let adsFound = 0;
  if (env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    try {
      for (const c of await google.listAdsCustomers(tokens.accessToken, env.GOOGLE_ADS_DEVELOPER_TOKEN, env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)) {
        await upsert({
          organizationId,
          provider: 'google_ads',
          externalId: c.id,
          displayName: c.descriptiveName,
          tokens,
          metadata: { currency: c.currency },
        });
        adsFound++;
      }
    } catch (error) {
      logger.warn({ organizationId, err: error }, 'Ads listing unavailable');
    }
  }

  // Stored even with no locations: YouTube uses the same grant.
  await upsert({
    organizationId,
    provider: 'youtube_channel',
    externalId: identity.id,
    displayName: identity.name ?? identity.email ?? 'Google account',
    avatarUrl: identity.pictureUrl,
    tokens,
    metadata: { email: identity.email, scopes: tokens.grantedScopes },
  });

  return {
    organizationId,
    accountEmail: identity.email,
    locationsFound: locations.length,
    sitesFound,
    propertiesFound,
    adsFound,
    businessProfileAvailable,
    message,
  };
}

async function upsert(input: {
  organizationId: string;
  provider: 'google_business' | 'youtube_channel' | 'google_search_console' | 'google_analytics' | 'google_ads';
  externalId: string;
  displayName: string;
  avatarUrl?: string;
  tokens: google.GoogleTokens;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const values = {
    organizationId: input.organizationId,
    provider: input.provider,
    externalId: input.externalId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    accessTokenEncrypted: encryptToken(input.tokens.accessToken),
    refreshTokenEncrypted: input.tokens.refreshToken
      ? encryptToken(input.tokens.refreshToken)
      : null,
    tokenExpiresAt: input.tokens.expiresAt,
    scopes: input.tokens.grantedScopes,
    metadata: input.metadata ?? {},
    status: 'active',
    lastError: null,
    updatedAt: new Date(),
  };

  await db
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({
      target: [connections.organizationId, connections.provider, connections.externalId],
      set: values,
    });
}

/**
 * A usable access token for a Google connection, refreshing it if expired.
 *
 * Google access tokens last an hour, so anything scheduled must refresh rather
 * than assume the stored token still works.
 */
export async function getGoogleAccessToken(
  organizationId: string,
  connectionId: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId)))
    .limit(1);

  if (!row) throw badRequest('Connection not found.');

  const notExpired = row.tokenExpiresAt && row.tokenExpiresAt.getTime() > Date.now() + 60_000;
  if (notExpired && row.accessTokenEncrypted) return decryptToken(row.accessTokenEncrypted);

  if (!row.refreshTokenEncrypted) {
    throw badRequest(`${row.displayName} needs to be reconnected.`);
  }

  const refreshed = await google.refreshAccessToken(decryptToken(row.refreshTokenEncrypted));
  await db
    .update(connections)
    .set({
      accessTokenEncrypted: encryptToken(refreshed.accessToken),
      tokenExpiresAt: refreshed.expiresAt,
      status: 'active',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(connections.id, row.id));

  return refreshed.accessToken;
}
