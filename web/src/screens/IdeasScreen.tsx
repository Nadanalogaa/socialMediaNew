import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, uploadToCloudinary, type Idea, type MediaAsset } from '../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

/**
 * The ideas board.
 *
 * A thought takes seconds to capture — a line, a link, a photo — and waits
 * here until it becomes a post or a reel. Nothing is lost between the
 * moment of inspiration and the moment there is time to make it.
 */
export function IdeasScreen({
  onMakePost,
  onMakeReel,
}: {
  onMakePost: (idea: Idea) => void;
  onMakeReel: (idea: Idea) => void;
}) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { ideas } = await api.listIdeas();
      setIdeas(ideas);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load ideas.');
      setIdeas([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      const registered = await api.registerMedia({
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        url: uploaded.url,
        width: uploaded.width,
        height: uploaded.height,
        bytes: file.size,
        providerRef: uploaded.publicId,
      });
      setAsset(registered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createIdea({
        title: title.trim(),
        notes: notes.trim() || undefined,
        url: url.trim() || undefined,
        mediaAssetId: asset?.id ?? null,
      });
      setTitle('');
      setNotes('');
      setUrl('');
      setAsset(null);
      setExpanded(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the idea.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(idea: Idea, status: 'open' | 'done') {
    try {
      await api.updateIdea(idea.id, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the idea.');
    }
  }

  async function remove(idea: Idea) {
    if (!confirm('Delete this idea?')) return;
    try {
      await api.deleteIdea(idea.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the idea.');
    }
  }

  const visible = (ideas ?? []).filter((i) => (showDone ? i.status === 'done' : i.status === 'open'));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Ideas</h2>
        <p className="mt-0.5 text-sm text-slate-600">Jot down what to post about. Turn one into a post or a reel when you're ready.</p>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="e.g. Student of the month — Keerthana's arangetram photos"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          <Button onClick={() => void add()} disabled={busy || !title.trim()}>
            Add
          </Button>
        </div>
        {expanded && (
          <div className="mt-2 space-y-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes, draft caption, who to tag…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Link (optional)"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
              {asset ? (
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  <img src={asset.thumbnailUrl ?? asset.url} alt="" className="h-8 w-8 rounded object-cover" />
                  <button onClick={() => setAsset(null)} className="text-red-600 hover:underline">
                    remove
                  </button>
                </span>
              ) : (
                <Button variant="secondary" className="!py-1 !text-xs" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : '📷 Add a photo'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="flex gap-1.5">
        {[false, true].map((done) => (
          <button
            key={String(done)}
            onClick={() => setShowDone(done)}
            className={`rounded-full border px-3 py-1 text-xs ${
              showDone === done ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {done ? 'Done' : 'To do'}{' '}
            <span className="text-slate-400">{(ideas ?? []).filter((i) => (done ? i.status === 'done' : i.status === 'open')).length}</span>
          </button>
        ))}
      </div>

      {ideas === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title={showDone ? 'Nothing finished yet' : 'No ideas yet'} hint={showDone ? undefined : 'Type one above — a word is enough.'} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((idea) => (
            <li key={idea.id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start gap-3">
                  {idea.media && (
                    <img src={idea.media.thumbnailUrl ?? idea.media.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{idea.title}</p>
                    {idea.notes && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-slate-600">{idea.notes}</p>}
                    {idea.url && (
                      <a href={idea.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-brand-600 hover:underline">
                        {idea.url}
                      </a>
                    )}
                  </div>
                  {idea.status === 'done' && <Badge tone="success">done</Badge>}
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  {idea.status === 'open' ? (
                    <>
                      <Button className="!px-2.5 !py-1 !text-xs" onClick={() => onMakePost(idea)}>
                        Make a post
                      </Button>
                      <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => onMakeReel(idea)}>
                        ✨ Make a reel
                      </Button>
                      <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => void setStatus(idea, 'done')}>
                        Done
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => void setStatus(idea, 'open')}>
                      Reopen
                    </Button>
                  )}
                  <Button variant="danger" className="!px-2.5 !py-1 !text-xs" onClick={() => void remove(idea)}>
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
