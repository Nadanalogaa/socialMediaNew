/**
 * Connecting Meta accounts.
 *
 * Two steps by design. The browser sends the Facebook SDK's short-lived user
 * token; the server exchanges it for a long-lived one, caches it in Redis
 * briefly, and returns only the *list* of pages. The user then picks which
 * pages to connect. The long-lived token never reaches the browser, and no
 * page is connected without an explicit choice.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Provider } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { connections } from '../../db/schema.js';
import { decryptToken, encryptToken } from '../../lib/crypto.js';
import { badRequest, notFound, serviceUnavailable } from '../../lib/errors.js';
import { features } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { connection as redis } from '../../queue/index.js';
import * as meta from '../../integrations/meta.js';
import { assertCanAddConnections } from '../usage/service.js';

/** Long enough to choose pages, short enough that a leaked handle is useless. */
const PENDING_TTL_SECONDS = 600;
const pendingKey = (handle: string) => `meta:pending:${handle}`;

export interface PendingConnection {
  handle: string;
  pages: { id: string; name: string; category?: string; pictureUrl?: string; instagram?: { id: string; username: string } | null }[];
}

/**
 * Exchanges the user token and lists the pages they administer, along with any
 * linked Instagram account, so the picker can show what each choice includes.
 */
export async function beginMetaConnection(
  organizationId: string,
  shortLivedUserToken: string,
): Promise<PendingConnection> {
  if (!features.meta) {
    throw serviceUnavailable('Facebook integration is not configured on this server.');
  }

  const longLivedToken = await meta.exchangeForLongLivedToken(shortLivedUserToken);
  // Recorded on every connection so a Meta data-deletion request naming this
  // user can find and remove everything they authorised.
  const owner = await meta.getTokenOwner(longLivedToken);
  let pages = await meta.listManagedPages(longLivedToken);

  // A Page owned by a Business portfolio may not appear under me/accounts.
  if (pages.length === 0) {
    const businessPages = await meta.listBusinessPages(longLivedToken);
    const seen = new Set(pages.map((page) => page.id));
    pages = [...pages, ...businessPages.filter((page) => !seen.has(page.id))];
  }

  if (pages.length === 0) {
    // An empty list means either no Pages or a missing permission, and the
    // user can only act on the difference if we say which.
    const granted = await meta.getGrantedPermissions(longLivedToken);
    logger.warn({ organizationId, granted }, 'Facebook connect returned no Pages');

    if (!granted.includes('pages_show_list')) {
      // Permissions at standard access are only offered to people holding a
      // role on the Meta app, and Facebook skips them silently otherwise — so
      // naming the account that signed in is what makes this diagnosable.
      throw badRequest(
        `Facebook granted only: ${granted.join(', ') || 'none'}. ` +
          `You signed in as ${owner.name} (ID ${owner.id}). ` +
          'Permissions still at standard access are only offered to people with a role on ' +
          'the Meta app, so check this account is listed under App roles — or sign in with ' +
          'one that is.',
      );
    }

    throw badRequest(
      'Your Facebook account has permission to list Pages, but no Pages were returned. ' +
        'Check that you are a full admin of the Page (Editor is not enough), and that you ' +
        'selected it during the Facebook consent step.',
    );
  }

  // Resolve IG links in parallel; a failure on one page must not fail the list.
  const enriched = await Promise.all(
    pages.map(async (page) => {
      const instagram = await meta.getLinkedInstagramAccount(page.id, page.accessToken);
      return {
        id: page.id,
        name: page.name,
        category: page.category,
        pictureUrl: page.pictureUrl,
        instagram: instagram ? { id: instagram.id, username: instagram.username } : null,
      };
    }),
  );

  const handle = randomUUID();
  await redis.setex(
    pendingKey(handle),
    PENDING_TTL_SECONDS,
    JSON.stringify({ organizationId, pages, facebookUserId: owner.id }),
  );

  return { handle, pages: enriched };
}

/**
 * Persists the chosen pages, and the Instagram account linked to each.
 *
 * An IG business account is addressed with its parent page's token, so the
 * page id is kept in metadata — publishing needs to find it later.
 */
export async function completeMetaConnection(
  organizationId: string,
  handle: string,
  pageIds: string[],
): Promise<{ connected: number }> {
  const raw = await redis.get(pendingKey(handle));
  if (!raw) {
    throw badRequest('This connection attempt expired. Please connect Facebook again.');
  }

  const pending = JSON.parse(raw) as {
    organizationId: string;
    pages: meta.ManagedPage[];
    facebookUserId: string;
  };
  if (pending.organizationId !== organizationId) {
    throw badRequest('This connection attempt belongs to a different organization.');
  }

  const chosen = pending.pages.filter((page) => pageIds.includes(page.id));
  if (chosen.length === 0) throw badRequest('None of the selected pages were available.');

  // Count IG accounts too: each is a separately publishable connection.
  const igAccounts = await Promise.all(
    chosen.map((page) => meta.getLinkedInstagramAccount(page.id, page.accessToken)),
  );
  const totalNew = chosen.length + igAccounts.filter(Boolean).length;
  await assertCanAddConnections(organizationId, totalNew);

  for (const [index, page] of chosen.entries()) {
    await upsertConnection({
      organizationId,
      provider: 'facebook_page',
      externalId: page.id,
      displayName: page.name,
      avatarUrl: page.pictureUrl,
      accessToken: page.accessToken,
      metadata: { category: page.category, authorizedByFacebookUserId: pending.facebookUserId },
    });

    const instagram = igAccounts[index];
    if (instagram) {
      await upsertConnection({
        organizationId,
        provider: 'instagram_business',
        externalId: instagram.id,
        displayName: `@${instagram.username}`,
        avatarUrl: instagram.profilePictureUrl,
        // IG publishing authenticates with the parent page's token.
        accessToken: page.accessToken,
        metadata: {
          pageId: page.id,
          username: instagram.username,
          authorizedByFacebookUserId: pending.facebookUserId,
        },
      });
    }
  }

  await redis.del(pendingKey(handle));
  logger.info({ organizationId, count: totalNew }, 'Meta connection completed');
  return { connected: totalNew };
}

async function upsertConnection(input: {
  organizationId: string;
  provider: Provider;
  externalId: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const values = {
    organizationId: input.organizationId,
    provider: input.provider,
    externalId: input.externalId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    accessTokenEncrypted: encryptToken(input.accessToken),
    metadata: input.metadata ?? {},
    status: 'active',
    lastError: null,
    updatedAt: new Date(),
  };

  // Reconnecting an existing page refreshes its token rather than duplicating it.
  await db
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({
      target: [connections.organizationId, connections.provider, connections.externalId],
      set: values,
    });
}

export async function listConnections(organizationId: string) {
  const rows = await db
    .select({
      id: connections.id,
      provider: connections.provider,
      externalId: connections.externalId,
      displayName: connections.displayName,
      avatarUrl: connections.avatarUrl,
      status: connections.status,
      lastError: connections.lastError,
      // Only meaningful where nothing renews the token; Google renews with
      // the refresh token, so its hourly expiry is not the user's concern.
      tokenExpiresAt: sql<Date | null>`case when ${connections.refreshTokenEncrypted} is null then ${connections.tokenExpiresAt} else null end`,
      createdAt: connections.createdAt,
      lastCheckedAt: sql<string | null>`${connections.metadata}->>'lastCheckedAt'`,
    })
    .from(connections)
    .where(eq(connections.organizationId, organizationId));

  // Tokens are deliberately absent from this projection; only when one
  // runs out is, so the client can warn before scheduled posts start failing.
  return rows;
}

export async function disconnect(organizationId: string, connectionId: string): Promise<void> {
  const deleted = await db
    .delete(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId)))
    .returning({ id: connections.id });

  if (deleted.length === 0) throw notFound('Connection not found');
}

export interface ResolvedConnection {
  id: string;
  provider: Provider;
  externalId: string;
  displayName: string;
  accessToken: string;
  metadata: Record<string, unknown>;
}

/**
 * Loads a connection and decrypts its token, scoped to the organization.
 *
 * Every publish path goes through this, so a token can only be used by the
 * tenant that owns it.
 */
export async function resolveConnection(
  organizationId: string,
  connectionId: string,
): Promise<ResolvedConnection> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId)))
    .limit(1);

  if (!row) throw notFound('Connection not found');
  if (!row.accessTokenEncrypted) {
    throw badRequest(`${row.displayName} needs to be reconnected.`);
  }

  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    displayName: row.displayName,
    accessToken: decryptToken(row.accessTokenEncrypted),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

/** Marks a connection as needing reauthentication after an auth failure. */
export interface HealthResult {
  id: string;
  displayName: string;
  provider: string;
  status: 'active' | 'expired' | 'error';
  lastError: string | null;
  checkedAt: string;
}

/**
 * Asks Meta whether a connection's token still works, and records the
 * answer on the row — so the Channels screen, the Home screen and scheduled
 * publishing all see the same truth.
 */
export async function checkConnection(organizationId: string, connectionId: string): Promise<HealthResult> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId)))
    .limit(1);
  if (!row) throw notFound('Connection not found');

  const checkedAt = new Date();
  const metadata = { ...(row.metadata ?? {}), lastCheckedAt: checkedAt.toISOString() };
  let status: HealthResult['status'] = 'active';
  let lastError: string | null = null;

  if (!row.accessTokenEncrypted) {
    status = 'expired';
    lastError = 'No access token stored. Reconnect this channel.';
  } else if (row.provider === 'youtube_channel' || row.provider === 'google_business' || row.provider === 'google_search_console') {
    try {
      // Refreshing proves the grant is alive; a revoked one fails here.
      const { getGoogleAccessToken } = await import('./google.js');
      await getGoogleAccessToken(organizationId, row.id);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      status = 'expired';
    }
  } else if (row.provider === 'facebook_page' || row.provider === 'instagram_business') {
    try {
      await meta.probeConnection(
        row.provider === 'instagram_business' ? 'instagram' : 'facebook',
        row.externalId,
        decryptToken(row.accessTokenEncrypted),
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      status = error instanceof meta.GraphApiError && error.isAuthError ? 'expired' : 'error';
      // A rate limit is not a broken connection; keep the previous verdict.
      if (error instanceof meta.GraphApiError && error.isRateLimit) {
        status = row.status as HealthResult['status'];
        lastError = row.lastError;
      }
    }
  }

  await db
    .update(connections)
    .set({ status, lastError, metadata, updatedAt: checkedAt })
    .where(eq(connections.id, row.id));

  return { id: row.id, displayName: row.displayName, provider: row.provider, status, lastError, checkedAt: checkedAt.toISOString() };
}

export async function checkAllConnections(organizationId: string): Promise<HealthResult[]> {
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.organizationId, organizationId));
  const results: HealthResult[] = [];
  for (const row of rows) results.push(await checkConnection(organizationId, row.id));
  return results;
}

export async function markConnectionError(
  connectionId: string,
  message: string,
  expired = false,
): Promise<void> {
  await db
    .update(connections)
    .set({ status: expired ? 'expired' : 'error', lastError: message, updatedAt: new Date() })
    .where(eq(connections.id, connectionId));
}
