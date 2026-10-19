import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type InboxThread } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { Alert, Badge, Button, Card, EmptyState, Spinner, providerLabel } from '../components/ui';

/**
 * Comments on everything the workspace published, in one place, with a reply
 * box under each. "Unanswered" is simply: the last word was not ours.
 */
export function InboxScreen() {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [filter, setFilter] = useState<'unanswered' | 'all'>('unanswered');
  const [days, setDays] = useState(30);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setRefreshing(true);
    try {
      const { threads, cachedAt } = await api.getInbox(days, refresh);
      setThreads(threads);
      setCachedAt(cachedAt);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load comments.');
      setThreads([]);
    } finally {
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reply(thread: InboxThread, commentId: string) {
    const message = draft[commentId]?.trim();
    if (!message) return;
    setSending(commentId);
    setError(null);
    try {
      await api.replyToComment({ targetId: thread.targetId, commentId, message });
      setDraft((d) => ({ ...d, [commentId]: '' }));
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the reply.');
    } finally {
      setSending(null);
    }
  }

  if (threads === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Reading comments from your channels…
      </div>
    );
  }

  const withComments = threads.filter((t) => t.comments.length > 0 || t.error);
  const visible = filter === 'unanswered' ? withComments.filter((t) => t.unanswered) : withComments;
  const unansweredCount = withComments.filter((t) => t.unanswered).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Inbox</h2>
          <p className="mt-0.5 text-sm text-slate-600">Comments on what you've published, with a reply box.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-xs">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded px-2.5 py-1 ${days === d ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                {d}d
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? 'Checking…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex items-center gap-1.5">
        {(['unanswered', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {f === 'unanswered' ? `Unanswered ${unansweredCount}` : `All ${withComments.length}`}
          </button>
        ))}
        {cachedAt && <span className="ml-auto text-[11px] text-slate-400">checked {formatDateTime(cachedAt)}</span>}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={filter === 'unanswered' ? 'Nothing waiting for a reply' : 'No comments yet'}
          hint={threads.length === 0 ? `Nothing published in the last ${days} days.` : 'New comments show up here on refresh.'}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((thread) => (
            <li key={thread.targetId}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <Badge tone="neutral">{providerLabel(thread.provider)}</Badge>
                      <span>{thread.channelName}</span>
                      {thread.publishedAt && <span>· {formatDateTime(thread.publishedAt)}</span>}
                      {thread.unanswered && <Badge tone="warning">needs a reply</Badge>}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-800">{thread.caption || 'No caption'}</p>
                  </div>
                  {thread.permalink && (
                    <a href={thread.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand-600 hover:underline">
                      Open post
                    </a>
                  )}
                </div>

                {thread.error ? (
                  <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    Could not read comments: {thread.error}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {thread.comments.map((c) => (
                      <li key={c.id} className={`flex gap-2 ${c.fromUs ? 'justify-end' : ''}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${c.fromUs ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          <p className={`text-[11px] ${c.fromUs ? 'text-brand-100' : 'text-slate-500'}`}>
                            {c.fromUs ? 'You' : c.authorName} · {formatDateTime(c.createdAt)}
                          </p>
                          <p className="whitespace-pre-line">{c.message}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!thread.error && thread.comments.length > 0 && (() => {
                  // Reply to the latest comment from someone else.
                  const last = [...thread.comments].reverse().find((c) => !c.fromUs);
                  if (!last) return null;
                  return (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={draft[last.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [last.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void reply(thread, last.id);
                          }
                        }}
                        placeholder={`Reply to ${last.authorName}…`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                      />
                      <Button onClick={() => void reply(thread, last.id)} disabled={sending === last.id || !draft[last.id]?.trim()}>
                        {sending === last.id ? 'Sending…' : 'Reply'}
                      </Button>
                    </div>
                  );
                })()}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
