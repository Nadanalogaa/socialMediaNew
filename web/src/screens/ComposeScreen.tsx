import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  api,
  uploadToCloudinary,
  type BrandKit,
  type Connection,
  type HashtagGroup,
  type MediaAsset,
  type Post,
  type SlotSuggestion,
} from '../lib/api';
import { daysUntil, formatDateTime, toDateInput, toLocalInput } from '../lib/dates';
import { applyBrandPlaceholders } from '../lib/brand';
import { Alert, Button, Card, Spinner, providerLabel } from '../components/ui';

const IG_CAPTION_LIMIT = 2200;
const PUBLISHABLE = ['facebook_page', 'instagram_business'];

/**
 * Post composer.
 *
 * One caption, one media file, many destinations — with a per-channel caption
 * when one channel needs different words, a first comment for the hashtags,
 * and a schedule that can be a time, the next free queue slot, or a repeat.
 * Also edits an existing draft or scheduled post.
 */
export function ComposeScreen({
  onPublished,
  initialAsset,
  initialCaption,
  editingPostId,
  onViewPosts,
}: {
  onPublished: () => void;
  /** Pre-loaded when arriving from the reel editor's Publish button. */
  initialAsset?: MediaAsset | null;
  /** Pre-filled when arriving from an idea. */
  initialCaption?: string;
  /** Set when opened from Posts → Edit. */
  editingPostId?: string;
  onViewPosts?: () => void;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState(initialCaption ?? '');
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [hashtagText, setHashtagText] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [showFirstComment, setShowFirstComment] = useState(false);
  /** Per-channel caption overrides, keyed by connection id. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [customising, setCustomising] = useState<string | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(initialAsset ?? null);
  const [groups, setGroups] = useState<HashtagGroup[]>([]);
  const [slots, setSlots] = useState<SlotSuggestion[]>([]);
  const [outcome, setOutcome] = useState<{ kind: 'draft' | 'scheduled' | 'publishing' | 'updated'; channels: number } | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [repeatDays, setRepeatDays] = useState('');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [editing, setEditing] = useState<Post | null>(null);
  const [loadingPost, setLoadingPost] = useState(Boolean(editingPostId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialAsset) {
      setAsset(initialAsset);
      setOutcome(null);
    }
  }, [initialAsset]);

  useEffect(() => {
    api
      .listConnections()
      .then(({ connections }) => {
        // Only channels that can receive an organic post.
        const publishable = connections.filter((c) => PUBLISHABLE.includes(c.provider));
        setConnections(publishable);
        if (!editingPostId) {
          setSelected(new Set(publishable.filter((c) => c.status === 'active').map((c) => c.id)));
        }
      })
      .catch(() => setError('Could not load your connected channels.'));
    api.listHashtagGroups().then(({ groups }) => setGroups(groups)).catch(() => {});
    api.getBrand().then(setBrand).catch(() => {});
    api.nextSlots(4).then(({ slots }) => setSlots(slots)).catch(() => {});
  }, [editingPostId]);

  // Editing: fill every field from the saved post.
  useEffect(() => {
    if (!editingPostId) return;
    setLoadingPost(true);
    api
      .getPost(editingPostId)
      .then((post) => {
        setEditing(post);
        setCaption(post.caption);
        setHashtagText(post.hashtags.join(' '));
        setFirstComment(post.firstComment ?? '');
        setShowFirstComment(Boolean(post.firstComment));
        setSelected(new Set(post.targets.map((t) => t.connectionId)));
        setOverrides(
          Object.fromEntries(post.targets.filter((t) => t.caption !== null).map((t) => [t.connectionId, t.caption!])),
        );
        const first = post.media[0];
        setAsset(first ? { ...first, width: null, height: null } : null);
        setScheduledAt(post.status === 'scheduled' ? toLocalInput(post.scheduledAt) : '');
        setRepeatDays(post.repeatEveryDays ? String(post.repeatEveryDays) : '');
        setRepeatUntil(toDateInput(post.repeatUntil));
      })
      .catch(() => setError('Could not load that post.'))
      .finally(() => setLoadingPost(false));
  }, [editingPostId]);

  const hashtags = useMemo(
    () =>
      hashtagText
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#/, '').trim())
        .filter(Boolean),
    [hashtagText],
  );

  const targetsInstagram = connections.some((c) => selected.has(c.id) && c.provider === 'instagram_business');
  const igLength = `${caption}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`.trim().length;
  const expiring = connections.filter((c) => selected.has(c.id) && c.tokenExpiresAt && daysUntil(c.tokenExpiresAt) <= 10);

  async function handleFile(file: File) {
    setError(null);
    setUploadPercent(0);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature, setUploadPercent);
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
      setUploadPercent(null);
    }
  }

  function insertGroup(group: HashtagGroup) {
    const current = new Set(hashtags);
    const merged = [...hashtags, ...group.tags.filter((t) => !current.has(t))];
    setHashtagText(merged.join(' '));
  }

  async function saveGroup() {
    if (hashtags.length === 0) return setError('Type some hashtags first.');
    const name = prompt('Name this hashtag set (e.g. "Dance classes"):');
    if (!name) return;
    try {
      const saved = await api.saveHashtagGroup({ name, tags: hashtags });
      setGroups((prev) => [...prev.filter((g) => g.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the set.');
    }
  }

  function reset() {
    setCaption('');
    setHashtagText('');
    setFirstComment('');
    setShowFirstComment(false);
    setOverrides({});
    setAsset(null);
    setScheduledAt('');
    setRepeatDays('');
    setRepeatUntil('');
  }

  const targets = () =>
    [...selected].map((connectionId) => ({
      connectionId,
      ...(overrides[connectionId]?.trim() ? { caption: overrides[connectionId]! } : {}),
    }));

  async function handleSubmit(mode: 'draft' | 'now' | 'schedule') {
    setError(null);
    if (!asset) return setError('Add a photo or video first.');
    if (selected.size === 0) return setError('Choose at least one channel.');
    if (mode === 'schedule' && !scheduledAt) return setError('Pick a time, or use a queue slot.');
    const when = mode === 'schedule' ? new Date(scheduledAt) : undefined;
    if (when && when.getTime() <= Date.now()) return setError('The scheduled time must be in the future.');

    const repeatEveryDays = repeatDays ? Number(repeatDays) : undefined;
    const repeat = {
      repeatEveryDays: repeatEveryDays || null,
      repeatUntil: repeatEveryDays && repeatUntil ? new Date(`${repeatUntil}T23:59:00`).toISOString() : null,
    };

    setBusy(true);
    try {
      if (editing) {
        await api.updatePost(editing.id, {
          caption,
          hashtags,
          mediaAssetIds: [asset.id],
          targets: targets(),
          firstComment: firstComment.trim() || null,
          ...repeat,
          // A schedule is set or cleared here; "now" publishes below.
          scheduledAt: mode === 'schedule' ? when!.toISOString() : mode === 'draft' ? null : undefined,
        });
        if (mode === 'now') await api.publishPost(editing.id);
        setOutcome({ kind: mode === 'now' ? 'publishing' : mode === 'schedule' ? 'scheduled' : 'updated', channels: selected.size });
      } else {
        const post = await api.createPost({
          caption,
          hashtags,
          mediaAssetIds: [asset.id],
          targets: targets(),
          scheduledAt: when?.toISOString(),
          firstComment: firstComment.trim() || undefined,
          repeatEveryDays: repeat.repeatEveryDays ?? undefined,
          repeatUntil: repeat.repeatUntil ?? undefined,
          asDraft: mode === 'draft',
        });
        setOutcome({
          kind: mode === 'draft' ? 'draft' : post.status === 'scheduled' ? 'scheduled' : 'publishing',
          channels: selected.size,
        });
        reset();
      }
      onPublished();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the post.');
    } finally {
      setBusy(false);
    }
  }

  if (loadingPost) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading post…
      </div>
    );
  }

  const selectedConnections = connections.filter((c) => selected.has(c.id));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Edit post' : 'New post'}</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          {editing ? 'Change anything, then save, schedule or publish.' : 'Write once, publish to every channel you choose.'}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {expiring.length > 0 && (
        <Alert tone="warning">
          {expiring.map((c) => c.displayName).join(', ')} — access expires soon. Reconnect from Channels
          before scheduling far ahead.
        </Alert>
      )}

      {outcome && (
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-900">
                {outcome.kind === 'draft'
                  ? 'Saved as a draft'
                  : outcome.kind === 'updated'
                    ? 'Changes saved'
                    : outcome.kind === 'scheduled'
                      ? 'Scheduled'
                      : `Publishing to ${outcome.channels} channel${outcome.channels === 1 ? '' : 's'}`}
              </p>
              <p className="mt-0.5 text-sm text-emerald-800">
                {outcome.kind === 'draft' || outcome.kind === 'updated'
                  ? 'Nothing has been sent. Publish it from Posts when you are ready.'
                  : outcome.kind === 'scheduled'
                    ? 'It will go out automatically at the time you set.'
                    : 'Instagram can take a minute or two to process video. Follow it in Posts.'}
              </p>
            </div>
            <div className="flex gap-2">
              {onViewPosts && <Button onClick={onViewPosts}>See it in Posts</Button>}
              {!editing && (
                <Button variant="secondary" onClick={() => setOutcome(null)}>
                  Make another
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="mb-2 text-sm font-medium text-slate-900">Photo or video</h3>
        {asset ? (
          <div className="flex items-start gap-3">
            {asset.kind === 'video' ? (
              <video src={asset.url} muted playsInline controls className="h-28 w-[63px] rounded-lg bg-black object-cover" />
            ) : (
              <img src={asset.thumbnailUrl ?? asset.url} alt="" className="h-24 w-24 rounded-lg object-cover" />
            )}
            <div className="flex-1">
              <p className="text-sm text-slate-700">
                {asset.kind === 'video' ? 'Video' : 'Image'} ready
                {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
              </p>
              <Button variant="secondary" className="mt-2" onClick={() => setAsset(null)}>
                Replace
              </Button>
            </div>
          </div>
        ) : uploadPercent !== null ? (
          <div className="flex items-center gap-3">
            <Spinner />
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-brand-600 transition-all" style={{ width: `${uploadPercent}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Uploading… {uploadPercent}%</p>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Choose a file
            </Button>
          </>
        )}
      </Card>

      <Card>
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-900">
            Caption
            <span className="flex gap-2 text-xs font-normal">
              {brand?.signature && !caption.includes(brand.signature) && (
                <button
                  type="button"
                  onClick={() => setCaption((c) => `${c.trimEnd()}\n\n${brand.signature}`.trim())}
                  className="text-brand-600 hover:underline"
                >
                  + Add signature
                </button>
              )}
              {brand && /\{(name|phone|website|email|address|tagline)\}/i.test(caption) && (
                <button
                  type="button"
                  onClick={() => setCaption((c) => applyBrandPlaceholders(c, brand))}
                  className="text-brand-600 hover:underline"
                >
                  Fill {'{placeholders}'}
                </button>
              )}
            </span>
          </span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            placeholder="What do you want to say?"
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-900">Hashtags</span>
          <input
            value={hashtagText}
            onChange={(e) => setHashtagText(e.target.value)}
            placeholder="dance chennai bharatanatyam"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {brand && brand.defaultHashtags.length > 0 && (
            <button
              type="button"
              onClick={() => insertGroup({ id: 'brand', name: 'Brand', tags: brand.defaultHashtags })}
              title={brand.defaultHashtags.map((t) => `#${t}`).join(' ')}
              className="rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-brand-700 hover:bg-brand-100"
            >
              + Brand tags
            </button>
          )}
          {groups.map((group) => (
            <span key={group.id} className="inline-flex items-center overflow-hidden rounded-full border border-slate-300">
              <button
                type="button"
                onClick={() => insertGroup(group)}
                title={group.tags.map((t) => `#${t}`).join(' ')}
                className="px-2.5 py-0.5 text-slate-700 hover:bg-slate-50"
              >
                + {group.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Delete the "${group.name}" set?`)) return;
                  void api.deleteHashtagGroup(group.id).then(() => setGroups((g) => g.filter((x) => x.id !== group.id)));
                }}
                aria-label={`Delete ${group.name}`}
                className="border-l border-slate-200 px-1.5 text-slate-400 hover:bg-slate-50 hover:text-red-600"
              >
                ✕
              </button>
            </span>
          ))}
          <button type="button" onClick={() => void saveGroup()} className="font-medium text-brand-600 hover:underline">
            Save these as a set
          </button>
          <span className="text-slate-500">· the # is added for you</span>
        </div>

        {targetsInstagram && igLength > IG_CAPTION_LIMIT && (
          <p className="mt-2 text-xs text-amber-700">
            Instagram allows {IG_CAPTION_LIMIT} characters; yours is {igLength}. It will be shortened, keeping your
            hashtags.
          </p>
        )}

        {showFirstComment ? (
          <label className="mt-3 block">
            <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-900">
              First comment
              <button
                type="button"
                onClick={() => {
                  setShowFirstComment(false);
                  setFirstComment('');
                }}
                className="text-xs font-normal text-slate-500 hover:underline"
              >
                Remove
              </button>
            </span>
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              rows={2}
              placeholder="Posted as a comment right after publishing — many accounts keep hashtags here."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            {hashtags.length > 0 && !firstComment && (
              <button
                type="button"
                onClick={() => setFirstComment(hashtags.map((h) => `#${h}`).join(' '))}
                className="mt-1 text-xs text-brand-600 hover:underline"
              >
                Use the hashtags as the first comment
              </button>
            )}
          </label>
        ) : (
          <button type="button" onClick={() => setShowFirstComment(true)} className="mt-3 text-xs font-medium text-brand-600 hover:underline">
            + Add a first comment
          </button>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-medium text-slate-900">Publish to</h3>
        {connections.length === 0 ? (
          <p className="text-sm text-slate-600">No channels connected yet. Add one from the Channels tab.</p>
        ) : (
          <ul className="space-y-2">
            {connections.map((connection) => {
              const disabled = connection.status !== 'active';
              const checked = selected.has(connection.id);
              const override = overrides[connection.id];
              return (
                <li key={connection.id} className="rounded-lg border border-slate-200">
                  <label
                    className={`flex items-center gap-3 p-2.5 ${
                      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={checked}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(connection.id)) next.delete(connection.id);
                          else next.add(connection.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="flex-1 text-sm text-slate-900">{connection.displayName}</span>
                    <span className="text-xs text-slate-500">
                      {disabled ? 'Reconnect needed' : providerLabel(connection.provider)}
                    </span>
                    {checked && !disabled && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setCustomising((v) => (v === connection.id ? null : connection.id));
                        }}
                        className={`text-xs ${override !== undefined ? 'font-medium text-brand-700' : 'text-brand-600'} hover:underline`}
                      >
                        {override !== undefined ? '✎ Custom caption' : 'Customise'}
                      </button>
                    )}
                  </label>
                  {customising === connection.id && (
                    <div className="border-t border-slate-100 p-2.5">
                      <textarea
                        value={override ?? caption}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [connection.id]: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                      />
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>Only {providerLabel(connection.provider)} gets this wording. Hashtags are still added.</span>
                        {override !== undefined && (
                          <button
                            type="button"
                            onClick={() =>
                              setOverrides((prev) => {
                                const next = { ...prev };
                                delete next[connection.id];
                                return next;
                              })
                            }
                            className="text-brand-600 hover:underline"
                          >
                            Use the shared caption
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-medium text-slate-900">
          When <span className="font-normal text-slate-500">(optional)</span>
        </h3>
        {slots.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Next free slot:</span>
            {slots.map((slot) => {
              const active = scheduledAt === toLocalInput(slot.at);
              return (
                <button
                  key={slot.at}
                  type="button"
                  onClick={() => setScheduledAt(active ? '' : toLocalInput(slot.at))}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          {scheduledAt && (
            <span className="text-xs text-slate-500">
              {formatDateTime(new Date(scheduledAt))}
              <button type="button" onClick={() => setScheduledAt('')} className="ml-2 text-brand-600 hover:underline">
                clear
              </button>
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-slate-700">
            <span>↻ Repeat every</span>
            <input
              type="number"
              min={1}
              max={365}
              value={repeatDays}
              onChange={(e) => setRepeatDays(e.target.value)}
              placeholder="—"
              className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <span>days</span>
          </label>
          {repeatDays && (
            <label className="flex items-center gap-2 text-slate-700">
              <span>until</span>
              <input
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-slate-500">(blank = keep going)</span>
            </label>
          )}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Leave the time empty to publish now. Repeats are evergreen posts: each copy is queued N days after the last
          one went out, and shows in the calendar.
        </p>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => void handleSubmit('draft')} disabled={busy || !asset || selected.size === 0}>
          {editing ? (editing.status === 'scheduled' ? 'Save & unschedule' : 'Save changes') : 'Save as draft'}
        </Button>
        {scheduledAt ? (
          <Button onClick={() => void handleSubmit('schedule')} disabled={busy || !asset || selected.size === 0}>
            {busy ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4" /> Saving…
              </span>
            ) : editing?.status === 'scheduled' ? (
              'Save & reschedule'
            ) : (
              'Schedule post'
            )}
          </Button>
        ) : (
          <Button onClick={() => void handleSubmit('now')} disabled={busy || !asset || selected.size === 0}>
            {busy ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                Sending to {selected.size} channel{selected.size === 1 ? '' : 's'}…
              </span>
            ) : (
              'Publish now'
            )}
          </Button>
        )}
      </div>
      <p className="text-right text-xs text-slate-500">
        A draft is saved privately — nothing reaches your audience until you publish it.
        {selectedConnections.length > 1 && ' Each channel succeeds or fails on its own.'}
      </p>
    </div>
  );
}
