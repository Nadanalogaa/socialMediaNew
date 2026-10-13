import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type AnalyticsPayload } from '../lib/api';
import { BarChart, ChartGrid, LineChart, StatTile } from '../components/charts';
import { Alert, Button, Card, Spinner, providerLabel } from '../components/ui';

/** Compact figures: 12.4k reads faster than 12,431 in a stat tile. */
function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    try {
      setData(await api.getAnalytics(range));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load analytics.');
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  async function handleRefresh() {
    setRefreshing(true);
    setNotice(null);
    try {
      await api.refreshAnalytics();
      setNotice(
        'Refresh queued. Figures update once a worker processes it — run the worker if none is running.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not queue a refresh.');
    } finally {
      setRefreshing(false);
    }
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading analytics…
      </div>
    );
  }

  const { summary, timeseries, channels, topPosts } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            How your posts are performing across every connected channel.
          </p>
        </div>
        {/* Filters sit in one row above the charts. */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            {[7, 30, 90].map((range) => (
              <button
                key={range}
                onClick={() => setDays(range)}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  days === range
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {range}d
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
            {refreshing ? 'Queuing…' : 'Refresh figures'}
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total engagement"
          value={compact(summary.engagement.total)}
          hint={`${compact(summary.engagement.likes)} likes · ${compact(
            summary.engagement.comments,
          )} comments`}
        />
        <StatTile label="Posts published" value={summary.posts.published} />
        <StatTile
          label="Scheduled"
          value={summary.posts.scheduled}
          hint={summary.posts.scheduled > 0 ? 'Waiting to go out' : undefined}
        />
        <StatTile
          label="Failed"
          value={summary.posts.failed}
          tone={summary.posts.failed > 0 ? 'bad' : 'neutral'}
          hint={summary.posts.failed > 0 ? 'Check Posts for the reason' : undefined}
        />
      </div>

      <ChartGrid>
        <LineChart
          title={`Engagement over the last ${days} days`}
          data={timeseries.map((point) => ({
            label: shortDate(point.date),
            value: point.engagement,
          }))}
          formatValue={compact}
        />
        <LineChart
          title={`Posts published over the last ${days} days`}
          data={timeseries.map((point) => ({ label: shortDate(point.date), value: point.posts }))}
        />
      </ChartGrid>

      <ChartGrid>
        <BarChart
          title="Engagement by channel"
          data={channels.map((channel) => ({
            label: `${channel.displayName} · ${providerLabel(channel.provider)}`,
            value: channel.engagement,
          }))}
          formatValue={compact}
        />
        <BarChart
          title="Posts by channel"
          data={channels.map((channel) => ({
            label: `${channel.displayName} · ${providerLabel(channel.provider)}`,
            value: channel.posts,
          }))}
        />
      </ChartGrid>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-slate-900">Best performing posts</h3>
        {topPosts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nothing published yet. Your best posts appear here once they have engagement.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {topPosts.map((post) => (
              <li key={post.postId} className="flex items-start gap-3 py-2.5">
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {compact(post.engagement)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-700">
                    {post.caption || <span className="text-slate-400">No caption</span>}
                  </span>
                  {post.publishedAt && (
                    <span className="block text-xs text-slate-500">
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                </span>
                {post.permalink && (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-brand-600 hover:underline"
                  >
                    View
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
