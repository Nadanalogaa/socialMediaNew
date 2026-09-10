import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type Post } from '../lib/api';
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

/**
 * Post history.
 *
 * Every channel's outcome is shown separately, because a post can reach
 * Facebook and be rejected by Instagram — a single overall status would hide
 * the reason the user needs.
 */
export function PostsScreen() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { posts } = await api.listPosts();
      setPosts(posts);
      return posts;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load posts.');
      setPosts([]);
      return [];
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while something is mid-flight, then stop. Publishing is a
  // background job, so the page has to catch up on its own.
  useEffect(() => {
    const inFlight = posts?.some((p) => p.status === 'publishing' || p.status === 'scheduled');
    if (!inFlight) return;

    timerRef.current = window.setInterval(() => void load(), 4000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [posts, load]);

  async function handleDelete(id: string) {
    if (!confirm('Remove this post from your dashboard? It stays live on the platform.')) return;
    try {
      await api.deletePost(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the post.');
    }
  }

  if (posts === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading posts…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Posts</h2>
          <p className="mt-0.5 text-sm text-slate-600">Everything you've published or scheduled.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      {posts.length === 0 ? (
        <EmptyState title="Nothing published yet" hint="Create your first post from Compose." />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900">
                      {post.caption || <span className="text-slate-400">No caption</span>}
                    </p>
                    {post.hashtags.length > 0 && (
                      <p className="mt-1 text-xs text-brand-600">
                        {post.hashtags.map((tag) => `#${tag}`).join(' ')}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-slate-500">
                      {post.scheduledAt && post.status === 'scheduled'
                        ? `Scheduled for ${new Date(post.scheduledAt).toLocaleString()}`
                        : new Date(post.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={statusTone(post.status)}>{post.status.replace('_', ' ')}</Badge>
                    <Button variant="danger" onClick={() => void handleDelete(post.id)}>
                      Remove
                    </Button>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {post.targets.map((target) => (
                    <li key={target.id} className="flex items-start gap-2 text-xs">
                      <Badge tone={statusTone(target.status)}>{target.status}</Badge>
                      <span className="text-slate-700">{providerLabel(target.provider)}</span>
                      {target.permalink && (
                        <a
                          href={target.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 hover:underline"
                        >
                          View
                        </a>
                      )}
                      {target.error && (
                        <span className="min-w-0 flex-1 text-red-600">{target.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
