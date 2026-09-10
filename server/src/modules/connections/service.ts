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
import { and, eq } from 'drizzle-orm';
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
  const pages = await meta.listManagedPages(longLivedToken);

  if (pages.length === 0) {
    throw badRequest(
      'No Facebook Pages found for this account. You must be an admin of at least one Page.',
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
    JSON.stringify({ organizationId, pages }),
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

  const pending = JSON.parse(raw) as { organizationId: string; pages: meta.ManagedPage[] };
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
      metadata: { category: page.category },
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
        metadata: { pageId: page.id, username: instagram.username },
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
      createdAt: connections.createdAt,
    })
    .from(connections)
    .where(eq(connections.organizationId, organizationId));

  // Tokens are deliberately absent from this projection.
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
