/**
 * The platform admin portal's API.
 *
 * Everything here crosses tenant boundaries on purpose — it is how the
 * people running the service see every workspace, grant plans, extend
 * trials, suspend abuse and step into a customer's account to help them.
 * Every write leaves an audit row.
 */

import { Router } from 'express';
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { adminOrganizationPatchSchema, findPlan, idParamSchema } from '@socialboost/shared';
import { db } from '../../db/client.js';
import {
  auditLogs,
  billingOrders,
  connections,
  memberships,
  organizations,
  posts,
  subscriptions,
  users,
} from '../../db/schema.js';
import { asyncHandler, requireAuth, requirePlatformAdmin, validate } from '../../http/middleware.js';
import { notFound } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { publishQueue } from '../../queue/index.js';
import { resolvePlan } from '../billing/service.js';
import { getUsageSummary } from '../usage/service.js';

export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requirePlatformAdmin);

const DAY = 86_400_000;

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = Date.now();
    const [orgs] = await db.select({ total: count() }).from(organizations);
    const [people] = await db.select({ total: count() }).from(users);
    const [newOrgs] = await db
      .select({ total: count() })
      .from(organizations)
      .where(gte(organizations.createdAt, new Date(now - 30 * DAY)));
    const active = await db
      .select({ planCode: subscriptions.planCode })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'active'), gte(subscriptions.currentPeriodEnd, new Date())));
    const mrrInPaise = active.reduce((sum, s) => sum + findPlan(s.planCode).priceInPaise, 0);
    const [trialing] = await db
      .select({ total: count() })
      .from(organizations)
      .where(and(gte(organizations.trialEndsAt, new Date()), eq(organizations.planSource, 'free')));
    const [posted] = await db
      .select({ total: count() })
      .from(posts)
      .where(and(eq(posts.status, 'published'), gte(posts.publishedAt, new Date(now - 30 * DAY))));
    const [failed] = await db
      .select({ total: count() })
      .from(posts)
      .where(and(inArray(posts.status, ['failed', 'partially_failed']), gte(posts.updatedAt, new Date(now - 7 * DAY))));
    const [expiring] = await db
      .select({ total: count() })
      .from(connections)
      .where(and(isNotNull(connections.tokenExpiresAt), lt(connections.tokenExpiresAt, new Date(now + 7 * DAY))));
    const [revenue] = await db
      .select({ total: sql<number>`coalesce(sum(${billingOrders.amountInPaise}), 0)::int` })
      .from(billingOrders)
      .where(and(eq(billingOrders.status, 'paid'), gte(billingOrders.paidAt, new Date(now - 30 * DAY))));

    // The queue is informative, not essential: Redis being down must not take the portal down.
    let queue: Record<string, number> | null = null;
    try {
      queue = await publishQueue.getJobCounts('waiting', 'delayed', 'active', 'failed');
    } catch {
      queue = null;
    }

    res.json({
      organizations: orgs?.total ?? 0,
      newOrganizations30d: newOrgs?.total ?? 0,
      users: people?.total ?? 0,
      activeSubscriptions: active.length,
      trialing: trialing?.total ?? 0,
      mrrInPaise,
      revenue30dInPaise: revenue?.total ?? 0,
      postsPublished30d: posted?.total ?? 0,
      postsFailed7d: failed?.total ?? 0,
      tokensExpiring7d: expiring?.total ?? 0,
      queue,
    });
  }),
);

adminRouter.get(
  '/organizations',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        planCode: organizations.planCode,
        planSource: organizations.planSource,
        trialEndsAt: organizations.trialEndsAt,
        suspendedAt: organizations.suspendedAt,
        createdAt: organizations.createdAt,
        members: sql<number>`(select count(*) from ${memberships} m where m.organization_id = ${organizations.id})::int`,
        channels: sql<number>`(select count(*) from ${connections} c where c.organization_id = ${organizations.id})::int`,
        posts30d: sql<number>`(select count(*) from ${posts} p where p.organization_id = ${organizations.id} and p.created_at > now() - interval '30 days')::int`,
        lastActivity: sql<Date | null>`(select max(p.updated_at) from ${posts} p where p.organization_id = ${organizations.id})`,
        ownerEmail: sql<string | null>`(select u.email from ${memberships} m join ${users} u on u.id = m.user_id where m.organization_id = ${organizations.id} and m.role = 'owner' order by m.created_at limit 1)`,
        periodEnd: subscriptions.currentPeriodEnd,
        subscriptionStatus: subscriptions.status,
      })
      .from(organizations)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .where(
        q
          ? or(
              ilike(organizations.name, `%${q}%`),
              sql`exists (select 1 from ${memberships} m join ${users} u on u.id = m.user_id where m.organization_id = ${organizations.id} and u.email ilike ${'%' + q + '%'})`,
            )
          : undefined,
      )
      .orderBy(desc(organizations.createdAt))
      .limit(200);

    res.json({
      organizations: rows.map((row) => ({
        ...row,
        effectivePlan: effectivePlanCode(row),
      })),
    });
  }),
);

/** Mirrors resolvePlan without a query per row. */
function effectivePlanCode(row: {
  planCode: string;
  planSource: string;
  trialEndsAt: Date | null;
  periodEnd: Date | null;
  subscriptionStatus: string | null;
}): { code: string; source: string } {
  const now = Date.now();
  if (row.planSource === 'manual' && row.planCode !== 'free') return { code: findPlan(row.planCode).code, source: 'manual' };
  if (row.planSource === 'subscription' && row.subscriptionStatus === 'active' && row.periodEnd && row.periodEnd.getTime() > now) {
    return { code: findPlan(row.planCode).code, source: 'subscription' };
  }
  if (row.trialEndsAt && row.trialEndsAt.getTime() > now) return { code: 'growth', source: 'trial' };
  return { code: 'free', source: 'free' };
}

adminRouter.get(
  '/organizations/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw notFound('Workspace not found');

    const [plan, usage, members, channels, recentPosts, orders, audit] = await Promise.all([
      resolvePlan(id),
      getUsageSummary(id),
      db
        .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, lastLoginAt: users.lastLoginAt })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, id)),
      db
        .select({
          id: connections.id,
          provider: connections.provider,
          displayName: connections.displayName,
          status: connections.status,
          tokenExpiresAt: connections.tokenExpiresAt,
          lastError: connections.lastError,
        })
        .from(connections)
        .where(eq(connections.organizationId, id)),
      db
        .select({ id: posts.id, caption: posts.caption, status: posts.status, createdAt: posts.createdAt, publishedAt: posts.publishedAt })
        .from(posts)
        .where(eq(posts.organizationId, id))
        .orderBy(desc(posts.createdAt))
        .limit(10),
      db.select().from(billingOrders).where(eq(billingOrders.organizationId, id)).orderBy(desc(billingOrders.createdAt)).limit(20),
      db.select().from(auditLogs).where(eq(auditLogs.organizationId, id)).orderBy(desc(auditLogs.createdAt)).limit(20),
    ]);

    res.json({ organization: org, plan, usage, members, channels, recentPosts, orders, audit });
  }),
);

adminRouter.patch(
  '/organizations/:id',
  validate(idParamSchema, 'params'),
  validate(adminOrganizationPatchSchema),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw notFound('Workspace not found');
    const input = req.body as { planCode?: string; extendTrialDays?: number; suspended?: boolean; note?: string };

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.planCode !== undefined) {
      set.planCode = input.planCode;
      set.planSource = input.planCode === 'free' ? 'free' : 'manual';
    }
    if (input.extendTrialDays) {
      const base = org.trialEndsAt && org.trialEndsAt.getTime() > Date.now() ? org.trialEndsAt : new Date();
      set.trialEndsAt = new Date(base.getTime() + input.extendTrialDays * DAY);
    }
    if (input.suspended !== undefined) set.suspendedAt = input.suspended ? new Date() : null;

    await db.update(organizations).set(set).where(eq(organizations.id, id));
    await db.insert(auditLogs).values({
      organizationId: id,
      userId: req.auth!.userId,
      action: 'admin.organization.updated',
      targetType: 'organization',
      targetId: id,
      metadata: { ...input },
    });
    logger.info({ organizationId: id, by: req.auth!.userId, input }, 'Admin changed a workspace');
    res.json({ plan: await resolvePlan(id) });
  }),
);

/**
 * Steps into a customer's workspace as its owner, for support.
 *
 * The token is a normal short-lived access token for the owner; there is no
 * refresh token, so the session ends on its own within minutes.
 */
adminRouter.post(
  '/organizations/:id/impersonate',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const [owner] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, id), eq(memberships.role, 'owner')))
      .limit(1);
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!owner || !org) throw notFound('Workspace or owner not found');

    await db.insert(auditLogs).values({
      organizationId: id,
      userId: req.auth!.userId,
      action: 'admin.impersonated',
      targetType: 'user',
      targetId: owner.id,
      metadata: { ownerEmail: owner.email },
    });

    res.json({
      accessToken: await signAccessToken({ userId: owner.id, email: owner.email }),
      refreshToken: '',
      user: { id: owner.id, email: owner.email, name: owner.name, isPlatformAdmin: false },
      organization: { ...org, role: owner.role },
      organizations: [{ ...org, role: owner.role }],
    });
  }),
);

adminRouter.get(
  '/payments',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: billingOrders.id,
        organizationId: billingOrders.organizationId,
        organizationName: organizations.name,
        planCode: billingOrders.planCode,
        interval: billingOrders.interval,
        amountInPaise: billingOrders.amountInPaise,
        status: billingOrders.status,
        razorpayOrderId: billingOrders.razorpayOrderId,
        razorpayPaymentId: billingOrders.razorpayPaymentId,
        paidAt: billingOrders.paidAt,
        createdAt: billingOrders.createdAt,
      })
      .from(billingOrders)
      .innerJoin(organizations, eq(organizations.id, billingOrders.organizationId))
      .orderBy(desc(billingOrders.createdAt))
      .limit(200);
    res.json({ payments: rows });
  }),
);
