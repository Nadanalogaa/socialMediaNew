import { useCallback, useEffect, useState } from 'react';
import { PLANS, PLAN_ORDER } from '@socialboost/shared';
import { ApiError, api, type BillingInfo, type Session } from '../lib/api';
import { rupees } from '../lib/money';
import { Alert, Badge, Button, Card, Spinner } from '../components/ui';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment window.'));
    document.head.appendChild(script);
  });
}

const USAGE_ROWS: { key: string; label: string }[] = [
  { key: 'connections', label: 'Channels connected' },
  { key: 'post_publish', label: 'Posts this month' },
  { key: 'seats', label: 'People' },
];

/**
 * Plan & billing.
 *
 * Prepaid: pay for a month or a year, and renew when it ends. While payments
 * are not configured the plans still show, and a platform admin can grant
 * one by hand.
 */
export function BillingScreen({ session }: { session: Session }) {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canPay = session.organization.role === 'owner' || session.organization.role === 'admin';

  const load = useCallback(async () => {
    try {
      setInfo(await api.getBilling());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load billing.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(planCode: string) {
    if (!info) return;
    setError(null);
    setNotice(null);
    setBusy(planCode);
    try {
      const order = await api.startCheckout(planCode, interval);
      await loadCheckout();
      await new Promise<void>((resolve) => {
        const checkout = new window.Razorpay!({
          key: order.keyId,
          amount: order.amountInPaise,
          currency: order.currency,
          name: 'SocialBoost',
          description: `${order.planName} plan · ${interval}`,
          order_id: order.orderId,
          prefill: { email: session.user.email, name: session.user.name },
          theme: { color: '#4f46e5' },
          modal: { ondismiss: () => resolve() },
          handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            api
              .verifyPayment(response)
              .then((updated) => {
                setInfo(updated);
                setNotice(`You're on ${updated.plan.name}. Thank you!`);
              })
              .catch((err) => setError(err instanceof ApiError ? err.message : 'Payment could not be verified.'))
              .finally(resolve);
          },
        });
        checkout.open();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not start the payment.');
    } finally {
      setBusy(null);
    }
  }

  if (!info) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> {error ?? 'Loading…'}
      </div>
    );
  }

  const endsLabel = info.endsAt ? new Date(info.endsAt).toLocaleDateString() : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Plan & billing</h2>
        <p className="mt-0.5 text-sm text-slate-600">Prepaid per workspace. Pay for a month or a year; renew whenever it ends.</p>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {info.suspended && <Alert>This workspace is suspended. Contact support to restore it.</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">Current plan</p>
            <p className="text-xl font-semibold text-slate-900">
              {info.plan.name}{' '}
              <Badge tone={info.source === 'trial' ? 'warning' : info.source === 'free' ? 'neutral' : 'success'}>
                {info.source === 'trial'
                  ? `trial · ends ${endsLabel}`
                  : info.source === 'subscription'
                    ? `paid · until ${endsLabel}`
                    : info.source === 'manual'
                      ? 'granted'
                      : 'free'}
              </Badge>
            </p>
          </div>
          {!info.paymentsEnabled && (
            <p className="text-xs text-slate-500">Online payment is not switched on yet — plans can be granted by the SocialBoost team.</p>
          )}
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {USAGE_ROWS.map((row) => {
            const entry = info.usage[row.key];
            if (!entry) return null;
            const unlimited = entry.limit === -1;
            const pct = unlimited ? 0 : Math.min(100, Math.round((entry.used / Math.max(1, entry.limit)) * 100));
            return (
              <li key={row.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-700">{row.label}</span>
                  <span className="font-medium text-slate-900">
                    {entry.used} / {unlimited ? '∞' : entry.limit}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-600'}`} style={{ width: `${unlimited ? 8 : pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex items-center justify-center gap-2 text-sm">
        <span className={interval === 'monthly' ? 'font-medium text-slate-900' : 'text-slate-500'}>Monthly</span>
        <button
          role="switch"
          aria-checked={interval === 'yearly'}
          onClick={() => setInterval((v) => (v === 'monthly' ? 'yearly' : 'monthly'))}
          className={`relative h-6 w-11 rounded-full transition ${interval === 'yearly' ? 'bg-brand-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${interval === 'yearly' ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
        <span className={interval === 'yearly' ? 'font-medium text-slate-900' : 'text-slate-500'}>
          Yearly <span className="text-xs text-emerald-700">2 months free</span>
        </span>
      </div>

      <ul className="grid gap-3 md:grid-cols-4">
        {PLAN_ORDER.map((code) => {
          const plan = PLANS[code]!;
          const current = info.plan.code === plan.code;
          const price = interval === 'yearly' ? plan.yearlyPriceInPaise : plan.priceInPaise;
          return (
            <li key={code}>
              <Card className={`flex h-full flex-col ${current ? 'ring-2 ring-brand-500' : ''}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                  {current && <Badge tone="info">current</Badge>}
                </div>
                <p className="text-xs text-slate-500">{plan.tagline}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {price === 0 ? '₹0' : rupees(price)}
                  <span className="text-xs font-normal text-slate-500">{price === 0 ? '' : interval === 'yearly' ? ' / year' : ' / month'}</span>
                </p>
                <ul className="mt-3 flex-1 space-y-1 text-xs text-slate-700">
                  {plan.highlights.map((h) => (
                    <li key={h}>✓ {h}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  {plan.code === 'free' ? (
                    <p className="text-center text-xs text-slate-500">{current ? 'Your plan' : 'Falls back here when a plan ends'}</p>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={!canPay || !info.paymentsEnabled || busy !== null}
                      onClick={() => void choose(plan.code)}
                      variant={current ? 'secondary' : 'primary'}
                    >
                      {busy === plan.code ? 'Opening…' : current && info.source === 'subscription' ? 'Renew / extend' : `Choose ${plan.name}`}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {!canPay && <p className="text-center text-xs text-slate-500">Only an owner or admin can change the plan.</p>}

      {info.orders.filter((o) => o.status === 'paid').length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-slate-900">Payments</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {info.orders
              .filter((o) => o.status === 'paid')
              .map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1 text-slate-900">
                    {PLANS[o.planCode]?.name ?? o.planCode} · {o.interval}
                  </span>
                  <span className="text-slate-700">{rupees(o.amountInPaise)}</span>
                  <span className="text-xs text-slate-500">{o.paidAt ? new Date(o.paidAt).toLocaleDateString() : ''}</span>
                  {o.razorpayPaymentId && <span className="font-mono text-[11px] text-slate-400">{o.razorpayPaymentId}</span>}
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
