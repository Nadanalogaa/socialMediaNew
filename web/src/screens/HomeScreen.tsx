import { useEffect, useState } from 'react';
import { ApiError, api, type Nudge, type Session } from '../lib/api';
import { daysUntil, formatDateTime } from '../lib/dates';
import { Alert, Badge, Button, Card, Spinner, providerLabel, statusTone } from '../components/ui';

type Home = Awaited<ReturnType<typeof api.getHome>>;

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function delta(now: number, before: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (before === 0 && now === 0) return { text: 'no change', tone: 'flat' };
  if (before === 0) return { text: 'new', tone: 'up' };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: 'same as last week', tone: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct}% vs last week`, tone: pct > 0 ? 'up' : 'down' };
}

/**
 * Home: how the workspace is doing and what needs doing, in one glance.
 * Every number already exists elsewhere; this is the morning view of them.
 */
export function HomeScreen({
  session,
  onGo,
}: {
  session: Session;
  onGo: (tab: 'compose' | 'posts' | 'reels' | 'channels' | 'ideas' | 'analytics' | 'google' | 'brand' | 'inbox') => void;
}) {
  const [home, setHome] = useState<Home | null>(null);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getHome().then(setHome).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load.'));
    // Slower (it asks Google), so it arrives after the rest of the page.
    api.getNudges().then(({ nudges }) => setNudges(nudges)).catch(() => setNudges([]));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (!home) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> {error ?? 'Loading…'}
      </div>
    );
  }

  const { attention, runway, recap, heatmap, topPosts, bestTimes } = home;
  const attentionCount = attention.failed.length + attention.expiring.length + attention.pending.length;
  const posted = delta(recap.thisWeek.published, recap.lastWeek.published);
  const engaged = delta(recap.thisWeek.engagement, recap.lastWeek.engagement);
  const max = Math.max(1, ...heatmap.map((d) => d.count));
  const weeks: Home['heatmap'][] = [];
  for (let i = 0; i < heatmap.length; i += 7) weeks.push(heatmap.slice(i, i + 7));
  const activeDays = heatmap.filter((d) => d.count > 0).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {greeting}, {session.user.name.split(' ')[0]}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">{session.organization.name} · this week at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onGo('compose')}>+ New post</Button>
          <Button variant="secondary" onClick={() => onGo('reels')}>
            ✨ Magic Design
          </Button>
          <Button variant="secondary" onClick={() => onGo('ideas')}>
            💡 Ideas
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {attentionCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <h3 className="mb-2 text-sm font-semibold text-amber-900">Needs your attention</h3>
          <ul className="space-y-1.5 text-sm">
            {attention.expiring.map((c) => {
              const d = c.tokenExpiresAt ? daysUntil(c.tokenExpiresAt) : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone="danger">channel</Badge>
                  <span className="text-slate-800">
                    {c.displayName} ({providerLabel(c.provider)}){' '}
                    {c.status !== 'active' ? 'needs reconnecting' : d !== null && d <= 0 ? 'access has expired' : `access expires in ${d} day${d === 1 ? '' : 's'}`}
                  </span>
                  <button onClick={() => onGo('channels')} className="text-brand-600 hover:underline">
                    Fix in Channels
                  </button>
                </li>
              );
            })}
            {attention.failed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(p.status)}>{p.status.replace('_', ' ')}</Badge>
                <span className="truncate text-slate-800">{p.caption || 'No caption'}</span>
                <button onClick={() => onGo('posts')} className="text-brand-600 hover:underline">
                  See why
                </button>
              </li>
            ))}
            {attention.pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">approval</Badge>
                <span className="truncate text-slate-800">{p.caption || 'No caption'}</span>
                <button onClick={() => onGo('posts')} className="text-brand-600 hover:underline">
                  Review
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-900">This week's to-dos</h3>
          {nudges === null && <span className="text-xs text-slate-400">checking…</span>}
        </div>
        {nudges && nudges.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing pressing — keep posting and replying.</p>}
        {nudges && nudges.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100">
            {nudges.map((n) => (
              <li key={n.key} className="flex items-start gap-3 py-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.severity === 'high' ? 'bg-red-500' : n.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                  <span className="block text-xs text-slate-600">{n.detail}</span>
                </span>
                <button onClick={() => onGo(n.tab)} className="shrink-0 text-xs text-brand-600 hover:underline">
                  Do it
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Content runway</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {runway.daysCovered} {runway.daysCovered === 1 ? 'day' : 'days'}
          </p>
          <p className="text-xs text-slate-500">
            {runway.scheduledCount === 0
              ? 'Nothing scheduled — add a post to the queue.'
              : `${runway.scheduledCount} post${runway.scheduledCount === 1 ? '' : 's'} lined up, until ${runway.lastScheduled ? new Date(runway.lastScheduled).toLocaleDateString() : ''}.`}
          </p>
          {runway.next.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
              {runway.next.map((p) => (
                <li key={p.id} className="flex gap-2">
                  <span className="shrink-0 text-slate-500">{formatDateTime(p.scheduledAt)}</span>
                  <span className="truncate text-slate-800">{p.caption || 'No caption'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This week</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {recap.thisWeek.published} <span className="text-sm font-normal text-slate-500">posts</span>
          </p>
          <p className={`text-xs ${posted.tone === 'up' ? 'text-emerald-700' : posted.tone === 'down' ? 'text-red-600' : 'text-slate-500'}`}>{posted.text}</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {compact(recap.thisWeek.engagement)} <span className="text-sm font-normal text-slate-500">engagement</span>
          </p>
          <p className={`text-xs ${engaged.tone === 'up' ? 'text-emerald-700' : engaged.tone === 'down' ? 'text-red-600' : 'text-slate-500'}`}>{engaged.text}</p>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Best times to post</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {bestTimes.times.slice(0, 4).map((t) => (
              <li key={t.label} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700">
                {t.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            {bestTimes.basis === 'history' ? 'From your own engagement.' : 'Typical peaks until you have 5 published posts.'}
          </p>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-slate-900">Posting consistency</h3>
            <span className="text-xs text-slate-500">{activeDays} active days in 12 weeks</span>
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((d) => {
                  const level = d.count === 0 ? 0 : Math.ceil((d.count / max) * 4);
                  const bg = ['bg-slate-100', 'bg-brand-200', 'bg-brand-400', 'bg-brand-600', 'bg-brand-700'][level];
                  return <span key={d.date} title={`${d.date}: ${d.count} post${d.count === 1 ? '' : 's'}`} className={`h-3.5 w-3.5 rounded-sm ${bg}`} />;
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Each square is a day; darker means more posts went out. Aim for no empty weeks.</p>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-slate-900">Top posts</h3>
            <button onClick={() => onGo('analytics')} className="text-xs text-brand-600 hover:underline">
              All analytics
            </button>
          </div>
          {topPosts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Your best posts appear here once they have engagement.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {topPosts.map((p) => (
                <li key={p.postId} className="flex items-start gap-3 py-2">
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-900">{compact(p.engagement)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700">{p.caption || 'No caption'}</span>
                    {p.publishedAt && <span className="block text-xs text-slate-500">{new Date(p.publishedAt).toLocaleDateString()}</span>}
                  </span>
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand-600 hover:underline">
                      View
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
