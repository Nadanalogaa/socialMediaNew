import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type Connection, type Post } from '../lib/api';
import { daysUntil, formatDateTime, sameDay, startOfDay, toLocalInput } from '../lib/dates';
import { CalendarView, postDate } from '../components/CalendarView';
import { PostingTimesPanel } from '../components/PostingTimesPanel';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  providerLabel,
  statusTone,
} from '../components/ui';

type View = 'calendar' | 'list';
type Filter = 'all' | 'draft' | 'pending' | 'scheduled' | 'published' | 'failed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'pending', label: 'Needs approval' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Needs attention' },
];

function matches(post: Post, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'failed') return post.status === 'failed' || post.status === 'partially_failed';
  if (filter === 'pending') return post.status === 'pending_approval';
  if (filter === 'scheduled') return post.status === 'scheduled' || post.status === 'publishing';
  return post.status === filter;
}

/**
 * Posts: the calendar and the list.
 *
 * Every channel's outcome is shown separately, because a post can reach
 * Facebook and be rejected by Instagram — a single overall status would hide
 * the reason the user needs.
 */
export function PostsScreen({
  onEdit,
  onCompose,
  role = 'owner',
}: {
  onEdit: (post: Post) => void;
  onCompose: () => void;
  role?: string;
}) {
  const canApprove = role === 'owner' || role === 'admin' || role === 'viewer';
  const canEdit = role !== 'viewer';
  const [requireApproval, setRequireApproval] = useState(false);
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('posts.view') as View) || 'calendar';
    } catch {
      return 'calendar';
    }
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTimes, setShowTimes] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Calendar state.
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<Date | null>(startOfDay(now));
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<{ id: string; value: string } | null>(null);

  const range = useMemo(() => {
    const from = new Date(cursor.year, cursor.month, -7);
    const to = new Date(cursor.year, cursor.month + 1, 14);
    return { from, to };
  }, [cursor]);

  const load = useCallback(async () => {
    try {
      const { posts } =
        view === 'calendar' ? await api.calendarPosts(range.from, range.to) : await api.listPosts(100);
      setPosts(posts);
      return posts;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load posts.');
      setPosts([]);
      return [];
    }
  }, [view, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.listConnections().then(({ connections }) => setConnections(connections)).catch(() => {});
    api.getSettings().then((s) => setRequireApproval(s.requireApproval)).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('posts.view', view);
    } catch {
      /* fine */
    }
  }, [view]);

  // Poll only while something is mid-flight, then stop. Publishing is a
  // background job, so the page has to catch up on its own.
  useEffect(() => {
    const inFlight = posts?.some((p) => p.status === 'publishing');
    if (!inFlight) return;
    timerRef.current = window.setInterval(() => void load(), 4000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [posts, load]);

  const expiring = connections.filter(
    (c) => c.tokenExpiresAt && daysUntil(c.tokenExpiresAt) <= 10,
  );

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  const handlePublish = (post: Post) =>
    confirm('Publish this post to its channels now?') && run(() => api.publishPost(post.id), 'Publishing.');
  const handleUnschedule = (post: Post) =>
    run(() => api.updatePost(post.id, { scheduledAt: null }), 'Moved back to drafts.');
  const handleDuplicate = (post: Post) =>
    run(() => api.duplicatePost(post.id), 'A copy was saved as a draft.');
  const handleSubmit = (post: Post) =>
    run(() => api.submitPost(post.id), 'Sent for approval.');
  const handleApprove = (post: Post) =>
    confirm('Approve this post? It publishes now, or at its scheduled time.') &&
    run(() => api.approvePost(post.id), 'Approved.');
  const handleReject = (post: Post) => {
    const note = prompt('What should change? (sent back to the author)') ?? undefined;
    return run(() => api.rejectPost(post.id, note), 'Sent back as a draft.');
  };
  const handleDelete = (post: Post) =>
    confirm('Remove this post from your dashboard? Anything already published stays live.') &&
    run(() => api.deletePost(post.id), 'Removed.');
  const handleReschedule = (post: Post, when: Date) => {
    if (when.getTime() <= Date.now()) return setError('Pick a time in the future.');
    return run(
      () => api.updatePost(post.id, { scheduledAt: when.toISOString() }),
      `Scheduled for ${formatDateTime(when)}.`,
    );
  };

  /** Drag to another day keeps the time of day; a draft gets the queue's morning. */
  function handleMove(post: Post, day: Date) {
    const previous = postDate(post);
    const when = new Date(day);
    if (post.scheduledAt) when.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
    else when.setHours(9, 0, 0, 0);
    if (when.getTime() <= Date.now()) {
      when.setTime(Date.now() + 10 * 60_000);
    }
    void handleReschedule(post, when);
  }

  if (posts === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading posts…
      </div>
    );
  }

  const visible = posts.filter((p) => matches(p, filter));
  const dayPosts = selectedDay ? visible.filter((p) => sameDay(postDate(p), selectedDay)) : [];
  const selectedPost = posts.find((p) => p.id === selectedPostId) ?? null;
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleString([], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Posts</h2>
          <p className="mt-0.5 text-sm text-slate-600">Everything scheduled, published or saved.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(['calendar', 'list'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${view === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {v === 'calendar' ? 'Calendar' : 'List'}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setShowTimes((v) => !v)}>
            ⏰ Posting times
          </Button>
          <Button onClick={onCompose}>+ New post</Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {expiring.length > 0 && (
        <Alert tone="warning">
          {expiring.map((c) => {
            const d = daysUntil(c.tokenExpiresAt!);
            return `${c.displayName} access ${d <= 0 ? 'has expired' : `expires in ${d} day${d === 1 ? '' : 's'}`}`;
          }).join(' · ')}
          . Reconnect it from Channels so scheduled posts keep going out.
        </Alert>
      )}

      {showTimes && <PostingTimesPanel onClose={() => setShowTimes(false)} />}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === f.key
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1 text-slate-400">{posts.filter((p) => matches(p, f.key)).length}</span>
            )}
          </button>
        ))}
      </div>

      {view === 'calendar' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => setCursor((c) => ({ year: c.month === 0 ? c.year - 1 : c.year, month: (c.month + 11) % 12 }))}
                className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{monthLabel}</span>
                <button
                  onClick={() => {
                    const t = new Date();
                    setCursor({ year: t.getFullYear(), month: t.getMonth() });
                    setSelectedDay(startOfDay(t));
                  }}
                  className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Today
                </button>
              </div>
              <button
                onClick={() => setCursor((c) => ({ year: c.month === 11 ? c.year + 1 : c.year, month: (c.month + 1) % 12 }))}
                className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <CalendarView
              year={cursor.year}
              month={cursor.month}
              posts={visible}
              selectedDay={selectedDay}
              onSelectDay={(day) => {
                setSelectedDay(day);
                setSelectedPostId(null);
              }}
              onSelectPost={(post) => {
                setSelectedDay(startOfDay(postDate(post)));
                setSelectedPostId(post.id);
              }}
              onMove={handleMove}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Drag a draft or scheduled post to another day to move it.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900">
              {selectedDay
                ? selectedDay.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
                : 'Pick a day'}
            </h3>
            {dayPosts.length === 0 ? (
              <EmptyState title="Nothing on this day" hint="Drag a post here, or create a new one." />
            ) : (
              <ul className="space-y-3">
                {(selectedPost ? [selectedPost, ...dayPosts.filter((p) => p.id !== selectedPost.id)] : dayPosts).map(
                  (post) => (
                    <li key={post.id}>
                      <PostCard
                        post={post}
                        highlighted={post.id === selectedPostId}
                        rescheduling={rescheduling?.id === post.id ? rescheduling.value : null}
                        onRescheduleChange={(value) => setRescheduling({ id: post.id, value })}
                        onRescheduleCommit={() => {
                          if (rescheduling?.id === post.id && rescheduling.value) {
                            void handleReschedule(post, new Date(rescheduling.value));
                            setRescheduling(null);
                          }
                        }}
                        onRescheduleOpen={() =>
                          setRescheduling({ id: post.id, value: toLocalInput(post.scheduledAt ?? new Date(Date.now() + 3600_000)) })
                        }
                        onRescheduleCancel={() => setRescheduling(null)}
                        onEdit={() => onEdit(post)}
                        canEdit={canEdit}
                        mustSubmit={requireApproval && role === 'member'}
                        canApprove={canApprove}
                        onSubmit={() => void handleSubmit(post)}
                        onApprove={() => void handleApprove(post)}
                        onReject={() => void handleReject(post)}
                        onPublish={() => void handlePublish(post)}
                        onUnschedule={() => void handleUnschedule(post)}
                        onDuplicate={() => void handleDuplicate(post)}
                        onDelete={() => void handleDelete(post)}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here yet" hint="Create your first post from Compose." />
      ) : (
        <ul className="space-y-3">
          {visible.map((post) => (
            <li key={post.id}>
              <PostCard
                post={post}
                rescheduling={rescheduling?.id === post.id ? rescheduling.value : null}
                onRescheduleChange={(value) => setRescheduling({ id: post.id, value })}
                onRescheduleCommit={() => {
                  if (rescheduling?.id === post.id && rescheduling.value) {
                    void handleReschedule(post, new Date(rescheduling.value));
                    setRescheduling(null);
                  }
                }}
                onRescheduleOpen={() =>
                  setRescheduling({ id: post.id, value: toLocalInput(post.scheduledAt ?? new Date(Date.now() + 3600_000)) })
                }
                onRescheduleCancel={() => setRescheduling(null)}
                onEdit={() => onEdit(post)}
                canEdit={canEdit}
                mustSubmit={requireApproval && role === 'member'}
                canApprove={canApprove}
                onSubmit={() => void handleSubmit(post)}
                onApprove={() => void handleApprove(post)}
                onReject={() => void handleReject(post)}
                onPublish={() => void handlePublish(post)}
                onUnschedule={() => void handleUnschedule(post)}
                onDuplicate={() => void handleDuplicate(post)}
                onDelete={() => void handleDelete(post)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostCard({
  post,
  highlighted,
  rescheduling,
  onRescheduleOpen,
  onRescheduleChange,
  onRescheduleCommit,
  onRescheduleCancel,
  onEdit,
  canEdit,
  mustSubmit,
  canApprove,
  onSubmit,
  onApprove,
  onReject,
  onPublish,
  onUnschedule,
  onDuplicate,
  onDelete,
}: {
  post: Post;
  highlighted?: boolean;
  rescheduling: string | null;
  onRescheduleOpen: () => void;
  onRescheduleChange: (value: string) => void;
  onRescheduleCommit: () => void;
  onRescheduleCancel: () => void;
  onEdit: () => void;
  canEdit: boolean;
  /** A member in a workspace that requires approval: no publish, submit instead. */
  mustSubmit: boolean;
  canApprove: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onPublish: () => void;
  onUnschedule: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const editable = canEdit && ['draft', 'pending_approval', 'scheduled', 'failed', 'partially_failed'].includes(post.status);
  const pending = post.status === 'pending_approval';
  const thumb = post.media[0];
  return (
    <Card className={highlighted ? 'ring-2 ring-brand-500' : ''}>
      <div className="flex items-start gap-3">
        {thumb &&
          (thumb.kind === 'video' ? (
            <video src={thumb.url} muted playsInline className="h-16 w-16 shrink-0 rounded-lg bg-black object-cover" />
          ) : (
            <img src={thumb.thumbnailUrl ?? thumb.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          ))}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(post.status)}>{post.status.replace('_', ' ')}</Badge>
            {post.repeatEveryDays && (
              <Badge tone="info">↻ every {post.repeatEveryDays}d</Badge>
            )}
            <span className="text-xs text-slate-500">
              {post.status === 'scheduled' && post.scheduledAt
                ? `Due ${formatDateTime(post.scheduledAt)}`
                : post.publishedAt
                  ? `Published ${formatDateTime(post.publishedAt)}`
                  : `Saved ${formatDateTime(post.createdAt)}`}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-sm text-slate-900">
            {post.caption || <span className="text-slate-400">No caption</span>}
          </p>
          {post.hashtags.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-brand-600">{post.hashtags.map((t) => `#${t}`).join(' ')}</p>
          )}
          {post.firstComment && (
            <p className="mt-0.5 truncate text-xs text-slate-500">💬 First comment: {post.firstComment}</p>
          )}
          {post.reviewNote && post.status === 'draft' && (
            <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">↩ Sent back: {post.reviewNote}</p>
          )}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
        {post.targets.map((target) => (
          <li key={target.id} className="flex items-center gap-1.5 text-xs">
            <Badge tone={statusTone(target.status)}>{target.status}</Badge>
            <span className="text-slate-700">{providerLabel(target.provider)}</span>
            {target.caption !== null && <span title="Custom caption for this channel" className="text-slate-400">✎</span>}
            {target.permalink && (
              <a href={target.permalink} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                View
              </a>
            )}
            {target.error && <span className="text-red-600">{target.error}</span>}
            {target.firstCommentError && (
              <span className="text-amber-700" title={target.firstCommentError}>
                first comment failed
              </span>
            )}
          </li>
        ))}
      </ul>

      {rescheduling !== null ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <input
            type="datetime-local"
            value={rescheduling}
            onChange={(e) => onRescheduleChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <Button className="!py-1 !text-xs" onClick={onRescheduleCommit}>
            {post.status === 'scheduled' ? 'Move' : 'Schedule'}
          </Button>
          <Button variant="secondary" className="!py-1 !text-xs" onClick={onRescheduleCancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {pending && canApprove && (
            <>
              <Button className="!px-2.5 !py-1 !text-xs" onClick={onApprove}>
                ✓ Approve
              </Button>
              <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={onReject}>
                ↩ Send back
              </Button>
            </>
          )}
          {pending && !canApprove && <span className="self-center text-xs text-slate-500">Waiting for approval</span>}
          {editable && (
            <>
              <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={onEdit}>
                Edit
              </Button>
              {!pending && mustSubmit && (
                <Button className="!px-2.5 !py-1 !text-xs" onClick={onSubmit}>
                  Submit for approval
                </Button>
              )}
              {!pending && !mustSubmit && (
                <>
                  <Button className="!px-2.5 !py-1 !text-xs" onClick={onPublish}>
                    Publish now
                  </Button>
                  <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={onRescheduleOpen}>
                    {post.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                  </Button>
                </>
              )}
              {post.status === 'scheduled' && (
                <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={onUnschedule}>
                  Unschedule
                </Button>
              )}
            </>
          )}
          {canEdit && (
            <>
              <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={onDuplicate}>
                Duplicate
              </Button>
              <Button variant="danger" className="!px-2.5 !py-1 !text-xs" onClick={onDelete}>
                Remove
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
