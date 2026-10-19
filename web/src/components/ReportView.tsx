import { useEffect, useState } from 'react';
import { ApiError, api, type ReportPayload } from '../lib/api';
import { BarChart, LineChart, StatTile } from './charts';
import { Alert, Button, Spinner, providerLabel } from './ui';

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/**
 * A client-facing report, branded with the workspace's kit, that prints to
 * PDF from the browser. No email service is involved: download and send.
 */
export function ReportView({ days, onClose }: { days: number; onClose: () => void }) {
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getReport(days)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not build the report.'));
  }, [days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accent = data?.brand.primaryColor ?? '#4f46e5';
  const from = new Date(Date.now() - days * 86_400_000);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-3 sm:p-6" onClick={onClose}>
      <div
        id="client-report"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Use "Save as PDF" in the print dialog to send this to a client.</p>
          <div className="flex gap-2">
            <Button onClick={() => window.print()} disabled={!data}>
              🖨 Print / Save as PDF
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}
        {!data && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Building the report…
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <header className="flex items-center justify-between gap-4 border-b-4 pb-4" style={{ borderColor: accent }}>
              <div className="flex items-center gap-3">
                {data.brand.logoUrl && <img src={data.brand.logoUrl} alt="" className="h-14 w-24 object-contain" />}
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">{data.brand.name}</h1>
                  <p className="text-sm text-slate-600">Social media report · last {days} days</p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>
                  {from.toLocaleDateString()} – {new Date().toLocaleDateString()}
                </p>
                {data.brand.website && <p>{data.brand.website}</p>}
              </div>
            </header>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Posts published" value={data.summary.posts.published} />
              <StatTile label="Total engagement" value={compact(data.summary.engagement.total)} />
              <StatTile label="Likes" value={compact(data.summary.engagement.likes)} />
              <StatTile label="Comments" value={compact(data.summary.engagement.comments)} />
            </div>

            {data.audience.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-900">Audience</h2>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.audience.map((a) => (
                    <li key={a.connectionId} className="rounded-lg border border-slate-200 p-2">
                      <p className="text-lg font-semibold text-slate-900">{a.followers === null ? '—' : compact(a.followers)}</p>
                      <p className="truncate text-xs text-slate-600">
                        {a.displayName} · {providerLabel(a.provider)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <LineChart
              title="Engagement over time"
              data={data.timeseries.map((p) => ({
                label: new Date(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                value: p.engagement,
              }))}
              formatValue={compact}
            />

            <BarChart
              title="Engagement by channel"
              data={data.channels.map((c) => ({ label: `${c.displayName} · ${providerLabel(c.provider)}`, value: c.engagement }))}
              formatValue={compact}
            />

            {data.google && (data.google.locations.length > 0 || data.google.sites.length > 0 || data.google.analytics.length > 0 || data.google.ads.length > 0) && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Google</h2>
                {data.google.locations.map((l) => (
                  <div key={l.title} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-medium text-slate-900">{l.title}</p>
                      {!l.error && <p className="text-sm"><span className="font-semibold">{l.score}</span><span className="text-slate-400">/100 visibility</span></p>}
                    </div>
                    {l.error ? (
                      <p className="text-xs text-slate-500">Business Profile data not available yet.</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">
                        Reviews {l.reviews.average.toFixed(1)} ★ · {l.reviews.total} total · {l.reviews.unanswered} unanswered
                        {l.performance && ` · Seen ${(l.performance.current.impressionsMaps + l.performance.current.impressionsSearch).toLocaleString('en-IN')} times · ${l.performance.current.calls} calls · ${l.performance.current.directions} directions · ${l.performance.current.websiteClicks} website clicks (28 days)`}
                      </p>
                    )}
                  </div>
                ))}
                {data.google.sites.map((s) => (
                  <div key={s.site} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">Search · {s.site}</p>
                    {s.error ? (
                      <p className="text-xs text-slate-500">Search data not available.</p>
                    ) : (
                      <>
                        <p className="mt-1 text-xs text-slate-600">{s.totals.clicks} clicks from Google ({s.totals.previousClicks} in the previous period) · {s.totals.impressions.toLocaleString('en-IN')} impressions</p>
                        <ul className="mt-1 grid gap-x-4 text-xs text-slate-700 sm:grid-cols-2">
                          {s.top.map((q) => (
                            <li key={q.query} className="flex justify-between"><span className="truncate">{q.query}</span><span className="tabular-nums">#{q.position}</span></li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
                {data.google.analytics.map((a) => (
                  <div key={a.property} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">Website · {a.property}</p>
                    {a.current ? (
                      <p className="mt-1 text-xs text-slate-600">{a.current.sessions.toLocaleString('en-IN')} visits · {a.current.users.toLocaleString('en-IN')} people · {a.current.keyEvents} enquiries{a.previous ? ` (previous period: ${a.previous.sessions} visits, ${a.previous.keyEvents} enquiries)` : ''}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Analytics not available.</p>
                    )}
                  </div>
                ))}
                {data.google.ads.map((ad) => (
                  <div key={ad.account} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">Google Ads · {ad.account}</p>
                    {ad.error ? (
                      <p className="text-xs text-slate-500">Ads data not available.</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">{ad.totals.clicks} clicks · {ad.currency === 'INR' ? '₹' : ad.currency + ' '}{Math.round(ad.totals.costMicros / 1e6).toLocaleString('en-IN')} spent · {Math.round(ad.totals.conversions)} leads (30 days)</p>
                    )}
                  </div>
                ))}
              </section>
            )}

            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Best performing posts</h2>
              {data.topPosts.length === 0 ? (
                <p className="text-sm text-slate-500">No published posts in this period.</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {data.topPosts.map((p, i) => (
                    <li key={p.postId} className="flex items-start gap-3 py-2">
                      <span className="w-6 shrink-0 text-sm font-semibold text-slate-400">{i + 1}</span>
                      <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-slate-900">{compact(p.engagement)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-800">{p.caption || 'No caption'}</span>
                        {p.publishedAt && <span className="block text-xs text-slate-500">{new Date(p.publishedAt).toLocaleDateString()}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500">
              Prepared {new Date(data.generatedAt).toLocaleString()} · Engagement = likes + comments + shares at the time of the report.
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
