import { useCallback, useEffect, useState } from 'react';
import { PLANS } from '@socialboost/shared';
import { ApiError, api, type AdminOrganization, type AdminOverview, type AdminPayment, type Session } from '../lib/api';
import { rupees } from '../lib/money';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';
import { StatTile } from '../components/charts';

type Tab = 'overview' | 'customers' | 'payments';

/**
 * The platform admin portal: every workspace, what they pay, how they use
 * the service, and the levers to help them.
 */
export function AdminScreen({ onImpersonate }: { onImpersonate: (session: Session) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [orgs, setOrgs] = useState<AdminOrganization[] | null>(null);
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = useCallback(async (query: string) => {
    try {
      const { organizations } = await api.adminOrganizations(query);
      setOrgs(organizations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load workspaces.');
      setOrgs([]);
    }
  }, []);

  useEffect(() => {
    api.adminOverview().then(setOverview).catch((err) => setError(err instanceof ApiError ? err.message : 'Not allowed.'));
    void loadOrgs('');
    api.adminPayments().then(({ payments }) => setPayments(payments)).catch(() => setPayments([]));
  }, [loadOrgs]);

  useEffect(() => {
    const t = setTimeout(() => void loadOrgs(q), 250);
    return () => clearTimeout(t);
  }, [q, loadOrgs]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Platform admin</h2>
          <p className="mt-0.5 text-sm text-slate-600">Every customer workspace, across the whole service.</p>
        </div>
        <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
          {(['overview', 'customers', 'payments'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 capitalize ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {tab === 'overview' &&
        (overview ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Workspaces" value={overview.organizations} hint={`+${overview.newOrganizations30d} in 30 days`} />
              <StatTile label="Users" value={overview.users} />
              <StatTile label="Paying" value={overview.activeSubscriptions} hint={`${overview.trialing} on trial`} />
              <StatTile label="MRR" value={rupees(overview.mrrInPaise)} hint={`${rupees(overview.revenue30dInPaise)} collected in 30 days`} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Posts published (30d)" value={overview.postsPublished30d} />
              <StatTile label="Failed posts (7d)" value={overview.postsFailed7d} tone={overview.postsFailed7d > 0 ? 'bad' : 'neutral'} />
              <StatTile label="Tokens expiring (7d)" value={overview.tokensExpiring7d} tone={overview.tokensExpiring7d > 0 ? 'bad' : 'neutral'} />
              <StatTile
                label="Publish queue"
                value={overview.queue ? `${overview.queue.waiting ?? 0} / ${overview.queue.delayed ?? 0}` : '—'}
                hint={overview.queue ? `waiting / scheduled · ${overview.queue.failed ?? 0} failed` : 'Redis unreachable'}
              />
            </div>
          </>
        ) : (
          <Spinner />
        ))}

      {tab === 'customers' && (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by workspace or owner email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          {orgs === null ? (
            <Spinner />
          ) : orgs.length === 0 ? (
            <EmptyState title="No workspaces match" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Workspace</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">People</th>
                    <th className="px-3 py-2">Channels</th>
                    <th className="px-3 py-2">Posts 30d</th>
                    <th className="px-3 py-2">Last activity</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orgs.map((o) => (
                    <tr key={o.id} className={o.suspendedAt ? 'bg-red-50/50' : ''}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{o.name}</p>
                        <p className="text-xs text-slate-500">{o.ownerEmail ?? '—'} · since {new Date(o.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={o.effectivePlan.source === 'subscription' ? 'success' : o.effectivePlan.source === 'trial' ? 'warning' : o.effectivePlan.source === 'manual' ? 'info' : 'neutral'}>
                          {PLANS[o.effectivePlan.code]?.name ?? o.effectivePlan.code} · {o.effectivePlan.source}
                        </Badge>
                        {o.suspendedAt && <Badge tone="danger">suspended</Badge>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{o.members}</td>
                      <td className="px-3 py-2 tabular-nums">{o.channels}</td>
                      <td className="px-3 py-2 tabular-nums">{o.posts30d}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{o.lastActivity ? new Date(o.lastActivity).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => setOpenId(o.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'payments' &&
        (payments === null ? (
          <Spinner />
        ) : payments.length === 0 ? (
          <EmptyState title="No payments yet" hint="Orders appear here as soon as a customer checks out." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Workspace</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Razorpay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(p.paidAt ?? p.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{p.organizationName}</td>
                    <td className="px-3 py-2">
                      {PLANS[p.planCode]?.name ?? p.planCode} · {p.interval}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{rupees(p.amountInPaise)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === 'paid' ? 'success' : p.status === 'failed' ? 'danger' : 'neutral'}>{p.status}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{p.razorpayPaymentId ?? p.razorpayOrderId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {openId && (
        <OrganizationDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void loadOrgs(q)}
          onImpersonate={onImpersonate}
        />
      )}
    </div>
  );
}

function OrganizationDrawer({
  id,
  onClose,
  onChanged,
  onImpersonate,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onImpersonate: (session: Session) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminOrganization>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.adminOrganization(id).then(setData).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load.'));
  }, [id]);

  useEffect(() => load(), [load]);

  async function patch(input: Parameters<typeof api.adminPatchOrganization>[1]) {
    setBusy(true);
    setError(null);
    try {
      await api.adminPatchOrganization(id, input);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  async function impersonate() {
    if (!confirm('Open this workspace as its owner? The session lasts 15 minutes and is logged.')) return;
    try {
      onImpersonate(await api.adminImpersonate(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the workspace.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        {error && <Alert>{error}</Alert>}
        {!data ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{data.organization.name}</h3>
                <p className="text-xs text-slate-500">
                  {data.organization.slug} · created {new Date(data.organization.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">
                ✕
              </button>
            </div>

            <Card>
              <p className="text-sm">
                Plan: <strong>{data.plan.plan.name}</strong> <Badge>{data.plan.source}</Badge>
                {data.plan.endsAt && <span className="ml-2 text-xs text-slate-500">until {new Date(data.plan.endsAt).toLocaleDateString()}</span>}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) void patch({ planCode: e.target.value });
                    e.target.value = '';
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Grant a plan…</option>
                  {Object.values(PLANS).map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                      {p.code === 'free' ? ' (clear grant)' : ''}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" disabled={busy} onClick={() => void patch({ extendTrialDays: 14 })}>
                  +14 days trial
                </Button>
                <Button
                  variant={data.organization.suspendedAt ? 'secondary' : 'danger'}
                  className="!px-2.5 !py-1 !text-xs"
                  disabled={busy}
                  onClick={() => void patch({ suspended: !data.organization.suspendedAt })}
                >
                  {data.organization.suspendedAt ? 'Lift suspension' : 'Suspend'}
                </Button>
                <Button className="!px-2.5 !py-1 !text-xs" onClick={() => void impersonate()}>
                  Open as owner
                </Button>
              </div>
            </Card>

            <Card>
              <h4 className="mb-1 text-sm font-medium text-slate-900">Usage this month</h4>
              <ul className="grid grid-cols-2 gap-1 text-xs text-slate-700">
                {Object.entries(data.usage.usage).map(([k, v]) => (
                  <li key={k}>
                    {k.replace('_', ' ')}: <strong>{v.used}</strong> / {v.limit === -1 ? '∞' : v.limit}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h4 className="mb-1 text-sm font-medium text-slate-900">People</h4>
              <ul className="text-xs text-slate-700">
                {data.members.map((m) => (
                  <li key={m.userId} className="flex justify-between py-0.5">
                    <span>
                      {m.name} · {m.email}
                    </span>
                    <span className="text-slate-500">
                      {m.role}
                      {m.lastLoginAt ? ` · seen ${new Date(m.lastLoginAt).toLocaleDateString()}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h4 className="mb-1 text-sm font-medium text-slate-900">Channels</h4>
              {data.channels.length === 0 ? (
                <p className="text-xs text-slate-500">None connected.</p>
              ) : (
                <ul className="text-xs text-slate-700">
                  {data.channels.map((c) => (
                    <li key={c.id} className="flex justify-between py-0.5">
                      <span>
                        {c.displayName} · {c.provider}
                      </span>
                      <span className={c.status === 'active' ? 'text-emerald-700' : 'text-red-600'}>
                        {c.status}
                        {c.tokenExpiresAt ? ` · exp ${new Date(c.tokenExpiresAt).toLocaleDateString()}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h4 className="mb-1 text-sm font-medium text-slate-900">Recent posts</h4>
              {data.recentPosts.length === 0 ? (
                <p className="text-xs text-slate-500">None yet.</p>
              ) : (
                <ul className="text-xs text-slate-700">
                  {data.recentPosts.map((p) => (
                    <li key={p.id} className="flex gap-2 py-0.5">
                      <Badge>{p.status}</Badge>
                      <span className="truncate">{p.caption || 'No caption'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {data.audit.length > 0 && (
              <Card>
                <h4 className="mb-1 text-sm font-medium text-slate-900">Admin history</h4>
                <ul className="text-xs text-slate-600">
                  {data.audit.map((a) => (
                    <li key={a.id}>
                      {new Date(a.createdAt).toLocaleString()} · {a.action}
                      {a.metadata && Object.keys(a.metadata).length > 0 ? ` · ${JSON.stringify(a.metadata)}` : ''}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
