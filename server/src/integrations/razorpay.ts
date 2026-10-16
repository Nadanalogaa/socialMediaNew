/**
 * Razorpay, over its REST API with basic auth.
 *
 * Prepaid orders rather than auto-debit subscriptions: a customer pays for a
 * month or a year, the plan runs for that long, and they pay again to renew.
 * Mandates (UPI AutoPay) fail often for small merchants and need their own
 * approval; prepaid works from day one in test mode.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env.js';

const API = 'https://api.razorpay.com/v1';

function auth(): string {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured');
  }
  return `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

export async function createOrder(input: {
  amountInPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: input.amountInPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
    }),
  });
  const body = (await response.json()) as RazorpayOrder & { error?: { description?: string } };
  if (!response.ok || body.error) {
    throw new Error(body.error?.description ?? `Razorpay order failed (${response.status})`);
  }
  return body;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Checkout's success callback is signed with the key secret over "order|payment". */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Webhooks are signed with the separate webhook secret over the raw body. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
