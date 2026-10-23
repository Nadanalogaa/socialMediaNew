import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ApiError, api, type CompetitorSnapshot, type GoogleLocationReport, type GoogleOverview, type KeywordSuggestion } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

/**
 * Google promotion: how the business looks on Google, what to fix this week,
 * the reviews to answer, the link to ask for more, and where the website
 * ranks for the searches that matter.
 */
export function GoogleScreen({ onConnect, onMakePost }: { onConnect: () => void; onMakePost?: (caption: string) => void }) {
  const [data, setData] = useState<GoogleOverview | null>(null);
  const [keywords, setKeywords] = useState<{ keywords: KeywordSuggestion[]; basis: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.getGoogleOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load Google data.');
      setData({ configured: false, ai: false, places: false, connected: false, account: null, locations: [], sites: [], analytics: [], ads: [], adsEnabled: false });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    api.getKeywords().then(setKeywords).catch(() => setKeywords({ keywords: [], basis: [] }));
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
              {data.analytics.length > 0 ? '✓' : '⏳'} <strong>Website analytics:</strong>{' '}
              {data.analytics.length > 0
                ? `${data.analytics.length} Google Analytics propert${data.analytics.length === 1 ? 'y' : 'ies'}`
                : 'none yet — the website needs a Google Analytics (GA4) tag; once this Google account has access to it, Connect Google again.'}
            </li>
            <li>
              {data.ads.length > 0 ? '✓' : data.adsEnabled ? '⏳' : '🔜'} <strong>Google Ads:</strong>{' '}
              {data.ads.length > 0
                ? `${data.ads.length} account${data.ads.length === 1 ? '' : 's'}`
                : data.adsEnabled
                  ? 'no Ads account on this Google login yet.'
                  : 'coming — being enabled on this service.'}
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
        <LocationCard key={loc.connectionId} loc={loc} onReplied={load} ai={data.ai} places={data.places} />
      ))}

      {keywords && keywords.keywords.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">What people search for</h3>
            <span className="text-xs text-slate-500">based on {keywords.basis.join(' · ')}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Use these words in your posts, your listing description and your website pages. Real searches first; phrases shown in grey are what customers typically type for your kind of business here.
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {keywords.keywords.map((k) => (
              <li key={k.phrase}>
                <button
                  onClick={() => onMakePost?.(k.phrase.charAt(0).toUpperCase() + k.phrase.slice(1) + ' — ')}
                  title={k.source === 'search' ? `Position #${k.position} · ${k.clicks} clicks · ${k.impressions} impressions — click to start a post` : 'Click to start a post with this phrase'}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    k.source === 'search' ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {k.phrase}
                  {k.source === 'search' && k.position !== undefined && <span className="ml-1 text-[10px] text-brand-500">#{k.position}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.analytics.map((a) => (
        <Card key={a.connectionId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Website visitors · {a.property}</h3>
            <span className="text-xs text-slate-500">{a.period.from} → {a.period.to}</span>
          </div>
          {a.error ? (
            <p className="mt-2 text-xs text-amber-900">{a.error}</p>
          ) : a.current ? (
            <>
              {a.tag && a.tag.installed === false && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-slate-800">
                  <p className="font-medium text-amber-900">
                    The Analytics tag is not on {a.tag.siteUrl || 'the website'} yet — so nothing is being counted.
                  </p>
                  <p className="mt-1">
                    Paste this just before <code>&lt;/head&gt;</code> on every page (or send it to whoever manages the website). Numbers start within a day.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono text-[11px] leading-snug text-slate-800">{`<script async src="https://www.googletagmanager.com/gtag/js?id=${a.tag.measurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${a.tag.measurementId}');
</script>`}</pre>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          `<script async src="https://www.googletagmanager.com/gtag/js?id=${a.tag!.measurementId}"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${a.tag!.measurementId}');\n</script>`,
                        )
                      }
                      className="text-brand-600 hover:underline"
                    >
                      Copy snippet
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Please add this Google Analytics tag to ${a.tag.siteUrl} before </head> on every page. Measurement ID: ${a.tag.measurementId}. Snippet: https://support.google.com/analytics/answer/9304153`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      Send to web developer
                    </a>
                    <span className="text-slate-500">Measurement ID {a.tag.measurementId}</span>
                  </div>
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ['Visits', a.current.sessions, a.previous?.sessions ?? 0],
                    ['People', a.current.users, a.previous?.users ?? 0],
                    ['Enquiries / key events', a.current.keyEvents, a.previous?.keyEvents ?? 0],
                    ['Engaged', a.current.engagementRate, a.previous?.engagementRate ?? 0],
                  ] as [string, number, number][]
                ).map(([label, now, before]) => {
                  const pct = before === 0 ? null : Math.round(((now - before) / before) * 100);
                  return (
                    <div key={label} className="rounded-lg border border-slate-200 p-2">
                      <p className="text-lg font-semibold text-slate-900">{label === 'Engaged' ? `${now}%` : now.toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-slate-500">{label}</p>
                      <p className={`text-[11px] ${pct === null ? 'text-slate-400' : pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct}% vs before`}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <p className="mb-1 font-medium text-slate-900">Where visitors came from</p>
                  <ul className="space-y-0.5 text-slate-700">
                    {a.current.channels.map((c) => (
                      <li key={c.channel} className="flex justify-between"><span>{c.channel}</span><span className="tabular-nums">{c.sessions}</span></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-medium text-slate-900">Most viewed pages</p>
                  <ul className="space-y-0.5 text-slate-700">
                    {a.current.pages.map((p) => (
                      <li key={p.page} className="flex justify-between gap-2"><span className="truncate">{p.page}</span><span className="tabular-nums">{p.views}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      ))}

      {data.ads.map((ad) => (
        <Card key={ad.connectionId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Google Ads · {ad.account}</h3>
            <span className="text-xs text-slate-500">last 30 days</span>
          </div>
          {ad.error ? (
            <p className="mt-2 text-xs text-amber-900">{ad.error}</p>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-lg font-semibold">{ad.totals.impressions.toLocaleString('en-IN')}</p><p className="text-[11px] text-slate-500">Ad views</p></div>
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-lg font-semibold">{ad.totals.clicks.toLocaleString('en-IN')}</p><p className="text-[11px] text-slate-500">Clicks</p></div>
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-lg font-semibold">{ad.currency === 'INR' ? '₹' : ad.currency + ' '}{Math.round(ad.totals.costMicros / 1e6).toLocaleString('en-IN')}</p><p className="text-[11px] text-slate-500">Spent</p></div>
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-lg font-semibold">{Math.round(ad.totals.conversions)}</p><p className="text-[11px] text-slate-500">Leads</p></div>
              </div>
              {ad.campaigns.length > 0 && (
                <table className="mt-3 w-full text-xs">
                  <thead className="text-left uppercase tracking-wide text-slate-500"><tr><th className="py-1">Campaign</th><th>Status</th><th>Clicks</th><th>Spent</th><th>Leads</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {ad.campaigns.map((c) => (
                      <tr key={c.id}><td className="py-1 text-slate-900">{c.name}</td><td className="text-slate-500">{c.status.toLowerCase()}</td><td className="tabular-nums">{c.clicks}</td><td className="tabular-nums">{Math.round(c.costMicros / 1e6)}</td><td className="tabular-nums">{Math.round(c.conversions)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-xs text-slate-500">"Promote this offer" — creating a local campaign from here — arrives once Google issues the Ads developer token.</p>
            </>
          )}
        </Card>
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

function LocationCard({ loc, onReplied, ai, places }: { loc: GoogleLocationReport; onReplied: () => Promise<void>; ai: boolean; places: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [snapshot, setSnapshot] = useState<CompetitorSnapshot | null | 'loading'>(null);

  async function suggest(r: { name: string; reviewer: string; rating: number; comment: string }) {
    setSuggesting(r.name);
    setError(null);
    try {
      const { reply } = await api.suggestReviewReply({ reviewer: r.reviewer, rating: r.rating, comment: r.comment });
      setDraft((d) => ({ ...d, [r.name]: reply }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not suggest a reply.');
    } finally {
      setSuggesting(null);
    }
  }

  async function loadCompetitors() {
    setSnapshot('loading');
    try {
      setSnapshot(await api.getCompetitors(loc.connectionId));
    } catch (err) {
      setSnapshot({ connectionId: loc.connectionId, query: '', you: null, competitors: [], notes: [], error: err instanceof ApiError ? err.message : 'Could not load.' });
    }
  }

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

      {!loc.error && loc.performance && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ['Seen on Maps', loc.performance.current.impressionsMaps, loc.performance.previous.impressionsMaps],
              ['Seen on Search', loc.performance.current.impressionsSearch, loc.performance.previous.impressionsSearch],
              ['Calls', loc.performance.current.calls, loc.performance.previous.calls],
              ['Directions', loc.performance.current.directions, loc.performance.previous.directions],
              ['Website clicks', loc.performance.current.websiteClicks, loc.performance.previous.websiteClicks],
            ] as [string, number, number][]
          ).map(([label, now, before]) => {
            const pct = before === 0 ? null : Math.round(((now - before) / before) * 100);
            return (
              <div key={label} className="rounded-lg border border-slate-200 p-2">
                <p className="text-lg font-semibold text-slate-900">{now.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-slate-500">{label} · 28 days</p>
                <p className={`text-[11px] ${pct === null ? 'text-slate-400' : pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {pct === null ? (now > 0 ? 'new' : '—') : `${pct >= 0 ? '+' : ''}${pct}% vs before`}
                </p>
              </div>
            );
          })}
        </div>
      )}

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
                      {ai && (
                        <button
                          type="button"
                          onClick={() => void suggest({ name: r.name, reviewer: r.reviewer, rating: r.rating, comment: r.comment })}
                          disabled={suggesting === r.name}
                          title="Draft a reply in your brand's voice"
                          className="shrink-0 rounded-lg border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {suggesting === r.name ? '…' : '✨'}
                        </button>
                      )}
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

      {!loc.error && places && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {snapshot === null ? (
            <button onClick={() => void loadCompetitors()} className="text-xs font-medium text-brand-600 hover:underline">
              Compare with nearby {loc.category ? loc.category.toLowerCase() + 's' : 'businesses'} →
            </button>
          ) : snapshot === 'loading' ? (
            <p className="text-xs text-slate-500">Looking around {loc.locality ?? 'you'}…</p>
          ) : snapshot.error ? (
            <p className="text-xs text-amber-900">{snapshot.error}</p>
          ) : (
            <>
              <h4 className="text-sm font-medium text-slate-900">Nearby · "{snapshot.query}"</h4>
              <table className="mt-2 w-full text-xs">
                <thead className="text-left uppercase tracking-wide text-slate-500">
                  <tr><th className="py-1">Business</th><th>Rating</th><th>Reviews</th><th>Photos</th><th>Website</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshot.you && (
                    <tr className="bg-brand-50 font-medium text-brand-900">
                      <td className="py-1">You · {snapshot.you.name}</td><td>{snapshot.you.rating ?? '—'}</td><td>{snapshot.you.reviews}</td><td>{snapshot.you.photos}</td><td>{snapshot.you.website ? '✓' : '—'}</td>
                    </tr>
                  )}
                  {snapshot.competitors.map((c) => (
                    <tr key={c.placeId} className="text-slate-700">
                      <td className="py-1">
                        {c.mapsUri ? <a href={c.mapsUri} target="_blank" rel="noreferrer" className="hover:underline">{c.name}</a> : c.name}
                      </td>
                      <td>{c.rating ?? '—'}</td><td>{c.reviews}</td><td>{c.photos}</td><td>{c.website ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
                {snapshot.notes.map((n) => <li key={n}>→ {n}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
