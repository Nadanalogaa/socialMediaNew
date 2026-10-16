/**
 * Plans and payments.
 *
 * The effective plan is computed on every read rather than stored as truth:
 * a paid period that has ended, a trial that has run out, or a plan an admin
 * granted all resolve here, so nothing has to run at midnight to downgrade
 * anyone.
 */

import { and, desc, eq } from 'drizzle-orm';
import { TRIAL_DAYS, findPlan, type Plan } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { auditLogs, billingOrders, organizations, subscriptions } from '../../db/schema.js';
import { badRequest, notFound, serviceUnavailable } from '../../lib/errors.js';
import { env, features } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import * as razorpay from '../../integrations/razorpay.js';
import { getUsageSummary } from '../usage/service.js';

export interface ResolvedPlan {
  plan: Plan;
  source: 'subscription' | 'manual' | 'trial' | 'free';
  /** When the current paid period or trial ends; null when it does not. */
  endsAt: Date | null;
  trialEndsAt: Date | null;
  suspended: boolean;
}

export async function resolvePlan(organizationId: string): Promise<ResolvedPlan> {
  const [org] = await db
    .select({
      planCode: organizations.planCode,
      planSource: organizations.planSource,
      trialEndsAt: organizations.trialEndsAt,
      suspendedAt: organizations.suspendedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) throw notFound('Organization not found');

  const now = Date.now();
  const suspended = org.suspendedAt !== null;

  if (org.planSource === 'manual' && org.planCode !== 'free') {
    return { plan: findPlan(org.planCode), source: 'manual', endsAt: null, trialEndsAt: org.trialEndsAt, suspended };
  }

  if (org.planSource === 'subscription') {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    if (sub && sub.status === 'active' && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now) {
      return { plan: findPlan(sub.planCode), source: 'subscription', endsAt: sub.currentPeriodEnd, trialEndsAt: org.trialEndsAt, suspended };
    }
  }

  if (org.trialEndsAt && org.trialEndsAt.getTime() > now) {
    return { plan: findPlan('growth'), source: 'trial', endsAt: org.trialEndsAt, trialEndsAt: org.trialEndsAt, suspended };
  }

  return { plan: findPlan('free'), source: 'free', endsAt: null, trialEndsAt: org.trialEndsAt, suspended };
}

/** Everything the billing screen shows. */
export async function getBilling(organizationId: string) {
  const [resolved, usage, orders] = await Promise.all([
    resolvePlan(organizationId),
    getUsageSummary(organizationId),
    db
      .select()
      .from(billingOrders)
      .where(eq(billingOrders.organizationId, organizationId))
      .orderBy(desc(billingOrders.createdAt))
      .limit(20),
  ]);
  return {
    plan: resolved.plan,
    source: resolved.source,
    endsAt: resolved.endsAt,
    trialEndsAt: resolved.trialEndsAt,
    suspended: resolved.suspended,
    usage: usage.usage,
    orders,
    paymentsEnabled: features.billing,
    razorpayKeyId: features.billing ? env.RAZORPAY_KEY_ID : null,
  };
}

const PERIOD_DAYS = { monthly: 30, yearly: 365 } as const;

export async function startCheckout(
  organizationId: string,
  userId: string,
  input: { planCode: string; interval: 'monthly' | 'yearly' },
) {
  if (!features.billing) throw serviceUnavailable('Payments are not set up yet.');
  const plan = findPlan(input.planCode);
  if (plan.code === 'free') throw badRequest('The free plan needs no payment.');
  const amountInPaise = input.interval === 'yearly' ? plan.yearlyPriceInPaise : plan.priceInPaise;

  const order = await razorpay.createOrder({
    amountInPaise,
    receipt: `${organizationId.slice(0, 8)}-${Date.now()}`,
    notes: { organizationId, planCode: plan.code, interval: input.interval },
  });

  await db.insert(billingOrders).values({
    organizationId,
    razorpayOrderId: order.id,
    planCode: plan.code,
    interval: input.interval,
    amountInPaise,
    createdBy: userId,
  });

  return { orderId: order.id, amountInPaise, currency: 'INR', keyId: env.RAZORPAY_KEY_ID, planName: plan.name };
}

/** Called from the browser after Checkout succeeds; the webhook is the backstop. */
export async function confirmCheckout(
  organizationId: string,
  input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  if (!razorpay.verifyCheckoutSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    throw badRequest('The payment could not be verified. If money was taken, it will be matched automatically.');
  }
  await activateOrder(input.razorpay_order_id, input.razorpay_payment_id, organizationId);
  return getBilling(organizationId);
}

/**
 * Turns a paid order into a plan period. Idempotent: the webhook and the
 * browser both call it, and a renewal extends from the current end rather
 * than from today.
 */
export async function activateOrder(razorpayOrderId: string, paymentId: string | null, organizationId?: string) {
  const [order] = await db
    .select()
    .from(billingOrders)
    .where(eq(billingOrders.razorpayOrderId, razorpayOrderId))
    .limit(1);
  if (!order) {
    logger.warn({ razorpayOrderId }, 'Paid order is not one of ours');
    return;
  }
  if (organizationId && order.organizationId !== organizationId) throw badRequest('That order belongs to another workspace.');
  if (order.status === 'paid') return;

  const now = new Date();
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, order.organizationId))
    .limit(1);
  const samePlanStillRunning =
    existing && existing.planCode === order.planCode && existing.currentPeriodEnd && existing.currentPeriodEnd.getTime() > now.getTime();
  const start = samePlanStillRunning ? existing!.currentPeriodEnd! : now;
  const end = new Date(start.getTime() + PERIOD_DAYS[order.interval] * 86_400_000);

  await db.transaction(async (tx) => {
    await tx
      .update(billingOrders)
      .set({ status: 'paid', razorpayPaymentId: paymentId, paidAt: now, updatedAt: now })
      .where(eq(billingOrders.id, order.id));
    await tx
      .insert(subscriptions)
      .values({
        organizationId: order.organizationId,
        planCode: order.planCode,
        razorpaySubscriptionId: null,
        status: 'active',
        currentPeriodStart: samePlanStillRunning ? existing!.currentPeriodStart : now,
        currentPeriodEnd: end,
        cancelAt: null,
      })
      .onConflictDoUpdate({
        target: subscriptions.organizationId,
        set: {
          planCode: order.planCode,
          status: 'active',
          currentPeriodStart: samePlanStillRunning ? existing!.currentPeriodStart : now,
          currentPeriodEnd: end,
          cancelAt: null,
          updatedAt: now,
        },
      });
    await tx
      .update(organizations)
      .set({ planCode: order.planCode, planSource: 'subscription', updatedAt: now })
      .where(eq(organizations.id, order.organizationId));
    await tx.insert(auditLogs).values({
      organizationId: order.organizationId,
      userId: order.createdBy,
      action: 'billing.activated',
      targetType: 'order',
      targetId: order.id,
      metadata: { planCode: order.planCode, interval: order.interval, amountInPaise: order.amountInPaise, end },
    });
  });
  logger.info({ organizationId: order.organizationId, planCode: order.planCode, end }, 'Plan activated');
}

/** Razorpay webhook events we act on. */
export async function handleWebhook(event: { event: string; payload: Record<string, unknown> }): Promise<void> {
  if (event.event !== 'order.paid' && event.event !== 'payment.captured') return;
  const payment = (event.payload as { payment?: { entity?: { id?: string; order_id?: string } } }).payment?.entity;
  const orderId = payment?.order_id ?? (event.payload as { order?: { entity?: { id?: string } } }).order?.entity?.id;
  if (!orderId) return;
  await activateOrder(orderId, payment?.id ?? null);
}

export async function listOrders(organizationId: string) {
  return db
    .select()
    .from(billingOrders)
    .where(and(eq(billingOrders.organizationId, organizationId), eq(billingOrders.status, 'paid')))
    .orderBy(desc(billingOrders.createdAt));
}

/** A fresh workspace tries Growth before it decides. */
export function trialEnd(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
}
