/**
 * Daily health sweep: every connection's token is probed, so an expired
 * channel is flagged before a scheduled post fails on it.
 */

import { db } from '../../db/client.js';
import { connections } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { checkConnection } from '../../modules/connections/service.js';

export async function processHealthSweep(): Promise<void> {
  const rows = await db
    .select({ id: connections.id, organizationId: connections.organizationId })
    .from(connections);
  let flagged = 0;
  for (const row of rows) {
    try {
      const result = await checkConnection(row.organizationId, row.id);
      if (result.status !== 'active') flagged++;
    } catch (error) {
      logger.warn({ err: error, connectionId: row.id }, 'Health check failed');
    }
  }
  logger.info({ checked: rows.length, flagged }, 'Health sweep finished');
}
