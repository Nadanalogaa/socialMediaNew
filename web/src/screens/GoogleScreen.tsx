import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ApiError, api, type GoogleLocationReport, type GoogleOverview } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

/**
 * Google promotion: how the business looks on Google, what to fix this week,
 * the reviews to answer, the link to ask for more, and where the website
 * ranks for the searches that matter.
 */
export function GoogleScreen({ onConnect }: { onConnect: () => void }) {
  const [data, setData] = useState<GoogleOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.getGoogleOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load Google data.');
      setData({ configured: false, connected: false, account: null, locations: [], sites: [] });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Reading your Google profile…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Google</h2>
          <p className="mt-0.5 text-sm text-slate-600">Your Business Profile on Maps and Search, reviews, and where your website ranks.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={refreshing}>
            {refreshing ? 'Checking…' : 'Refresh'}
          </Button>
          <Button variant="secondary" onClick={onConnect}>
            Connect Google
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!data.configured && (
        <Alert tone="info">Google sign-in is being set up for this service. Connect Facebook meanwhile; Google follows shortly.</Alert>
      )}

      {data.configured && !data.connected && (
        <EmptyState
          title="No Google account connected yet"
          hint="Settings → Channels → Connect Google. Sign in with the Google account that manages your Business Profile (the one you use for business.google.com)."
        />
      )}

      {data.connected && data.account && (
        <Card>
          <p className="text-sm text-slate-900">
            Google connected as <strong>{data.account.email ?? data.account.name}</strong>.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>
              {data.locations.length > 0 ? '✓' : '⏳'} <strong>Business Profile listings:</strong>{' '}
              {data.locations.length > 0
                ? `${data.locations.length} connected`
                : 'none yet — Google is still approving this app\'s access to the Business Profile API. Press Connect Google again once it is approved and your listings appear here.'}
            </li>
            <li>
              {data.sites.length > 0 ? '✓' : '⏳'} <strong>Website rankings:</strong>{' '}
              {data.sites.length > 0
                ? `${data.sites.length} propert${data.sites.length === 1 ? 'y' : 'ies'}`
                : 'none yet — add your website in Google Search Console with this Google account (Settings → Channels explains), then Connect Google again.'}
            </li>
          </ul>
        </Card>
      )}

      {data.locations.map((loc) => (
        <LocationCard key={loc.connectionId} loc={loc} onReplied={load} />
      ))}

      {data.sites.map((site) => (
        <Card key={site.connectionId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Search rankings · {site.site}</h3>
            <span className="text-xs text-slate-500">
              {site.period.from} → {site.period.to} · {site.totals.clicks} clicks ({site.totals.previousClicks} before) · {site.totals.impressions} impressions
            </span>
          </div>
          {site.error ? (
            <p className="mt-2 text-xs text-amber-900">{site.error}</p>
          ) : site.queries.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No search data yet for this period.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">What people searched</th>
                    <th className="py-1 pr-3">Position</th>
                    <th className="py-1 pr-3">Change</th>
                    <th className="py-1 pr-3">Clicks</th>
                    <th className="py-1">Impressions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {site.queries.map((q) => (
                    <tr key={q.query}>
                      <td className="py-1.5 pr-3 text-slate-900">{q.query}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        <span className={q.position <= 3 ? 'font-semibold text-emerald-700' : q.position <= 10 ? 'text-slate-900' : 'text-slate-500'}>#{q.position}</span>
                      </td>
                      <td className={`py-1.5 pr-3 tabular-nums text-xs ${q.change === null ? 'text-slate-400' : q.change > 0 ? 'text-emerald-700' : q.change < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {q.change === null ? 'new' : q.change > 0 ? `▲ ${q.change}` : q.change < 0 ? `▼ ${Math.abs(q.change)}` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{q.clicks}</td>
                      <td className="py-1.5 tabular-nums text-slate-500">{q.impressions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">Position 1–3 is the top of the page; 4–10 is page one. Posting weekly and answering reviews moves the map result; the website's own pages move the rest.</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function LocationCard({ loc, onReplied }: { loc: GoogleLocationReport; onReplied: () => Promise<void> }) {
  const [qr, setQr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!loc.reviewUri) return;
    QRCode.toDataURL(loc.reviewUri, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null));
  }, [loc.reviewUri]);

  async function reply(reviewName: string) {
    const comment = draft[reviewName]?.trim();
    if (!comment) return;
    setSending(reviewName);
    setError(null);
    try {
      await api.replyToReview({ connectionId: loc.connectionId, reviewName, comment });
      setDraft((d) => ({ ...d, [reviewName]: '' }));
      await onReplied();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the reply.');
    } finally {
      setSending(null);
    }
  }

  const todo = loc.items.filter((i) => !i.ok).sort((a, b) => b.points - a.points);
  const reviews = showAll ? loc.reviews.recent : loc.reviews.recent.filter((r) => !r.reply).slice(0, 5);
  const tone = loc.score >= 80 ? 'text-emerald-700' : loc.score >= 50 ? 'text-amber-700' : 'text-red-600';
  const shareText = encodeURIComponent(`Thank you for choosing ${loc.title}! It would mean a lot if you left us a quick Google review: ${loc.reviewUri ?? ''}`);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{loc.title}</h3>
          {loc.address && <p className="text-xs text-slate-500">{loc.address}</p>}
          {loc.mapsUri && (
            <a href={loc.mapsUri} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
              Open on Google Maps
            </a>
          )}
        </div>
        {!loc.error && (
          <div className="text-right">
            <p className={`text-3xl font-semibold ${tone}`}>{loc.score}<span className="text-sm text-slate-400">/100</span></p>
            <p className="text-xs text-slate-500">Google visibility score</p>
          </div>
        )}
      </div>

      {loc.error ? (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">{loc.error}</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <h4 className="text-sm font-medium text-slate-900">{todo.length === 0 ? 'Everything in place — keep posting and replying' : 'Do these to rank higher'}</h4>
            <ul className="mt-2 space-y-2">
              {todo.map((i) => (
                <li key={i.key} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                  <p className="text-sm font-medium text-slate-900">
                    {i.label} <span className="text-xs font-normal text-amber-800">+{i.points}</span>
                  </p>
                  <p className="text-xs text-slate-700">{i.fix}</p>
                </li>
              ))}
              {loc.items.filter((i) => i.ok).map((i) => (
                <li key={i.key} className="flex items-center gap-2 px-1 text-xs text-slate-500">
                  <span className="text-emerald-600">✓</span> {i.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Edit the listing itself at{' '}
              <a href="https://business.google.com" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                business.google.com
              </a>
              . Posts and review replies can be done right here.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-900">
              Reviews · {loc.reviews.average.toFixed(1)} ★ · {loc.reviews.total} total
              {loc.reviews.unanswered > 0 && <Badge tone="warning">{loc.reviews.unanswered} unanswered</Badge>}
            </h4>
            {loc.reviewUri && (
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                {qr && <img src={qr} alt="QR code to leave a review" className="h-20 w-20" />}
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-slate-900">Ask for a review</p>
                  <p className="text-slate-600">Show the QR at the counter, or send the link after a visit.</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button onClick={() => void navigator.clipboard?.writeText(loc.reviewUri!)} className="text-brand-600 hover:underline">
                      Copy link
                    </button>
                    <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                      Share on WhatsApp
                    </a>
                    {qr && (
                      <a href={qr} download={`review-qr-${loc.title.replace(/\s+/g, '-')}.png`} className="text-brand-600 hover:underline">
                        Download QR
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <ul className="mt-2 space-y-2">
              {reviews.length === 0 && <li className="text-xs text-slate-500">{showAll ? 'No reviews yet.' : 'Nothing waiting for a reply.'}</li>}
              {reviews.map((r) => (
                <li key={r.name} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {r.reviewerPhoto && <img src={r.reviewerPhoto} alt="" className="h-5 w-5 rounded-full" />}
                    <span className="font-medium text-slate-800">{r.reviewer}</span>
                    <span className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    <span>· {formatDateTime(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-slate-800">{r.comment}</p>}
                  {r.reply ? (
                    <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">You replied: {r.reply.comment}</p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={draft[r.name] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.name]: e.target.value }))}
                        placeholder={r.rating >= 4 ? `Thank ${r.reviewer}…` : 'Acknowledge and offer to put it right…'}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
                      />
                      <Button className="!px-2.5 !py-1 !text-xs" onClick={() => void reply(r.name)} disabled={sending === r.name || !draft[r.name]?.trim()}>
                        {sending === r.name ? '…' : 'Reply'}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-brand-600 hover:underline">
              {showAll ? 'Show only unanswered' : `Show all recent reviews (${loc.reviews.recent.length})`}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
