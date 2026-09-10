/**
 * Meta platform callbacks.
 *
 * Both are required for App Review. They are unauthenticated by necessity —
 * Meta calls them directly — so the signed request is the only thing that
 * establishes trust, and an unverifiable payload is treated as no match.
 */

import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections, dataDeletionRequests } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

/**
 * Finds every connection a given Facebook user authorised.
 *
 * The authorising user is recorded in metadata at connect time, so this is a
 * containment check on that JSON field rather than a join.
 */
function connectionsAuthorisedBy(facebookUserId: string) {
  return sql`${connections.metadata} ->> 'authorizedByFacebookUserId' = ${facebookUserId}`;
}

/**
 * Handles deauthorization: the client removed the app from their Facebook
 * account, so the tokens we hold are already dead. Removing them stops
 * scheduled posts from failing repeatedly against credentials that cannot work.
 */
export async function handleDeauthorize(facebookUserId: string): Promise<number> {
  const removed = await db
    .delete(connections)
    .where(connectionsAuthorisedBy(facebookUserId))
    .returning({ id: connections.id });

  logger.info({ facebookUserId, removed: removed.length }, 'Meta deauthorization processed');
  return removed.length;
}

export interface DeletionReceipt {
  confirmationCode: string;
  deleted: number;
}

/**
 * Handles a data deletion request.
 *
 * Deletes the connections and their stored tokens, then records the request so
 * the status URL Meta shows the user has something to report.
 */
export async function handleDataDeletion(facebookUserId: string): Promise<DeletionReceipt> {
  const confirmationCode = randomBytes(12).toString('hex');

  const removed = await db
    .delete(connections)
    .where(connectionsAuthorisedBy(facebookUserId))
    .returning({ id: connections.id });

  await db.insert(dataDeletionRequests).values({
    confirmationCode,
    provider: 'meta',
    externalUserId: facebookUserId,
    status: 'completed',
    connectionsDeleted: removed.length,
    completedAt: new Date(),
  });

  logger.info(
    { facebookUserId, removed: removed.length, confirmationCode },
    'Meta data deletion processed',
  );
  return { confirmationCode, deleted: removed.length };
}

export async function getDeletionStatus(confirmationCode: string) {
  const [row] = await db
    .select()
    .from(dataDeletionRequests)
    .where(eq(dataDeletionRequests.confirmationCode, confirmationCode))
    .limit(1);
  return row ?? null;
}
