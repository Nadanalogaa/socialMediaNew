/**
 * Plan limits and usage metering.
 *
 * Usage is recorded as append-only events; quota checks aggregate the current
 * billing month from the same table the dashboard reads, so the number a user
 * sees and the number that blocks them can never drift apart.
 */

import { and, count, eq, gte, sql } from 'drizzle-orm';
import { PLANS, USAGE_LIMIT_KEY, type PlanLimits, type UsageKind } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { connections, organizations, usageEvents } from '../../db/schema.js';
import { quotaExceeded } from '../../lib/errors.js';

/** Start of the current calendar month, in UTC. */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getPlanLimits(organizationId: string): Promise<PlanLimits> {
  const [org] = await db
    .select({ planCode: organizations.planCode })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return (PLANS[org?.planCode ?? 'free'] ?? PLANS.free!).limits;
}

/** Total quantity consumed for one usage kind this billing period. */
export async function getUsage(organizationId: string, kind: UsageKind): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.organizationId, organizationId),
        eq(usageEvents.kind, kind),
        gte(usageEvents.createdAt, currentPeriodStart()),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Throws if consuming `quantity` more of `kind` would exceed the plan.
 * Call before doing the work, then `recordUsage` after it succeeds — so a
 * failed publish or a failed render does not burn the customer's quota.
 */
export async function assertWithinQuota(
  organizationId: string,
  kind: UsageKind,
  quantity = 1,
): Promise<void> {
  const limitKey = USAGE_LIMIT_KEY[kind];
  if (!limitKey) return;

  const limits = await getPlanLimits(organizationId);
  const limit = limits[limitKey];
  if (limit === -1) return;

  const used = await getUsage(organizationId, kind);
  if (used + quantity > limit) {
    throw quotaExceeded(
      `You have used ${used} of ${limit} for this month. Upgrade your plan to continue.`,
      { kind, used, limit },
    );
  }
}

export async function recordUsage(
  organizationId: string,
  kind: UsageKind,
  quantity = 1,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(usageEvents).values({ organizationId, kind, quantity, metadata: metadata ?? {} });
}

/** Connections are a standing count rather than a monthly total. */
export async function assertCanAddConnections(
  organizationId: string,
  adding: number,
): Promise<void> {
  const limits = await getPlanLimits(organizationId);
  if (limits.connections === -1) return;

  const [row] = await db
    .select({ total: count() })
    .from(connections)
    .where(eq(connections.organizationId, organizationId));

  const existing = row?.total ?? 0;
  if (existing + adding > limits.connections) {
    throw quotaExceeded(
      `Your plan allows ${limits.connections} connected account(s). You have ${existing}.`,
      { existing, limit: limits.connections },
    );
  }
}

/** Everything the usage screen needs, in one round trip. */
export async function getUsageSummary(organizationId: string) {
  const limits = await getPlanLimits(organizationId);
  const kinds: UsageKind[] = ['ai_text', 'ai_image', 'ai_video', 'post_publish', 'wa_message'];
  const entries = await Promise.all(
    kinds.map(async (kind) => {
      const limitKey = USAGE_LIMIT_KEY[kind];
      return [
        kind,
        { used: await getUsage(organizationId, kind), limit: limitKey ? limits[limitKey] : -1 },
      ] as const;
    }),
  );
  return { limits, usage: Object.fromEntries(entries) };
}
