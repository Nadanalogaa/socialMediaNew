import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type DesignSummary } from '../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

/**
 * Saved designs.
 *
 * Everything made in the studio lands here so it can be reopened, changed and
 * published later — work is not lost when a tab closes.
 */
export function LibraryScreen({
  onOpen,
}: {
  onOpen: (design: { id: string; kind: 'image' | 'video' }) => void;
}) {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listDesigns({
        kind: kind === 'all' ? undefined : kind,
        tag: tag ?? undefined,
      });
      setDesigns(result.designs);
      setTags(result.tags);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your designs.');
      setDesigns([]);
    }
  }, [kind, tag]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(design: DesignSummary) {
    if (!confirm(`Delete "${design.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteDesign(design.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that design.');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">My designs</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Everything you have made. Open one to change it, then publish when you are ready.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Filters in one row above the results. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 p-0.5">
          {(['all', 'video', 'image'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setKind(value)}
              className={`rounded px-2.5 py-1 text-xs capitalize transition ${
                kind === value
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {value === 'video' ? 'Reels' : value === 'image' ? 'Posters' : 'All'}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((value) => (
              <button
                key={value}
                onClick={() => setTag(tag === value ? null : value)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  tag === value
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        )}
      </div>

      {designs === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      ) : designs.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          hint="Make a reel or a poster and press Save, and it will appear here."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {designs.map((design) => (
            <li key={design.id}>
              <Card className="flex h-full flex-col p-2">
                <button
                  onClick={() => onOpen({ id: design.id, kind: design.kind })}
                  className="block overflow-hidden rounded-lg bg-slate-900"
                  style={{ aspectRatio: design.ratio === 'story' ? '9 / 16' : '1 / 1' }}
                >
                  {design.kind === 'video' && design.previewUrl ? (
                    <video
                      src={design.previewUrl}
                      muted
                      playsInline
                      onMouseEnter={(e) => void e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : design.thumbnailUrl || design.previewUrl ? (
                    <img
                      src={design.thumbnailUrl ?? design.previewUrl!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-slate-500">
                      Not rendered yet
                    </span>
                  )}
                </button>

                <div className="mt-2 min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{design.name}</p>
                  {design.shortDescription && (
                    <p className="truncate text-xs text-slate-500">{design.shortDescription}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge tone={design.kind === 'video' ? 'info' : 'neutral'}>
                      {design.kind === 'video' ? 'Reel' : 'Poster'}
                    </Badge>
                    {design.tags.slice(0, 2).map((value) => (
                      <span key={value} className="text-xs text-slate-400">
                        #{value}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex gap-1">
                  <Button
                    className="flex-1 !px-2 !py-1 !text-xs"
                    onClick={() => onOpen({ id: design.id, kind: design.kind })}
                  >
                    Open
                  </Button>
                  <button
                    onClick={() => void handleDelete(design)}
                    title="Delete"
                    className="rounded-lg border border-red-300 px-2 text-xs text-red-700 hover:bg-red-50"
                  >
                    ×
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
