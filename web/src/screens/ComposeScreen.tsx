import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  api,
  uploadToCloudinary,
  type Connection,
  type MediaAsset,
} from '../lib/api';
import { Alert, Button, Card, Spinner, providerLabel } from '../components/ui';

const IG_CAPTION_LIMIT = 2200;

/**
 * Post composer.
 *
 * One caption, one media file, many destinations — the shape most small
 * businesses actually want. Per-channel caption overrides exist in the API and
 * can surface here later without changing the model.
 */
export function ComposeScreen({ onPublished }: { onPublished: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState('');
  const [hashtagText, setHashtagText] = useState('');
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listConnections()
      .then(({ connections }) => {
        // Only channels that can receive an organic post.
        const publishable = connections.filter((c) =>
          ['facebook_page', 'instagram_business'].includes(c.provider),
        );
        setConnections(publishable);
        setSelected(new Set(publishable.filter((c) => c.status === 'active').map((c) => c.id)));
      })
      .catch(() => setError('Could not load your connected channels.'));
  }, []);

  const hashtags = hashtagText
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

  const targetsInstagram = connections.some(
    (c) => selected.has(c.id) && c.provider === 'instagram_business',
  );
  const igLength = `${caption}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`.trim().length;

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

  async function handlePublish() {
    setError(null);
    setNotice(null);
    if (!asset) return setError('Add a photo or video first.');
    if (selected.size === 0) return setError('Choose at least one channel.');

    setBusy(true);
    try {
      const post = await api.createPost({
        caption,
        hashtags,
        mediaAssetIds: [asset.id],
        targets: [...selected].map((connectionId) => ({ connectionId })),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });

      setNotice(
        post.status === 'scheduled'
          ? 'Scheduled. It will publish automatically at the time you set.'
          : 'Publishing now — watch its progress in Posts.',
      );
      setCaption('');
      setHashtagText('');
      setAsset(null);
      setScheduledAt('');
      onPublished();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the post.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">New post</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Write once, publish to every channel you choose.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <h3 className="mb-2 text-sm font-medium text-slate-900">Photo or video</h3>
        {asset ? (
          <div className="flex items-start gap-3">
            <img
              src={asset.thumbnailUrl ?? asset.url}
              alt=""
              className="h-24 w-24 rounded-lg object-cover"
            />
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
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
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
          <span className="mb-1 block text-sm font-medium text-slate-900">Caption</span>
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
          <span className="mt-1 block text-xs text-slate-500">
            Separate with spaces or commas. The # is added for you.
          </span>
        </label>

        {/* Instagram silently truncates over its limit, so warn before publishing. */}
        {targetsInstagram && igLength > IG_CAPTION_LIMIT && (
          <p className="mt-2 text-xs text-amber-700">
            Instagram allows {IG_CAPTION_LIMIT} characters; yours is {igLength}. It will be
            shortened, keeping your hashtags.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-medium text-slate-900">Publish to</h3>
        {connections.length === 0 ? (
          <p className="text-sm text-slate-600">
            No channels connected yet. Add one from the Channels tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {connections.map((connection) => {
              const disabled = connection.status !== 'active';
              return (
                <li key={connection.id}>
                  <label
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      disabled
                        ? 'cursor-not-allowed border-slate-200 opacity-60'
                        : 'cursor-pointer border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.has(connection.id)}
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
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">
            Schedule <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Leave empty to publish immediately.
          </span>
        </label>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handlePublish} disabled={busy || !asset || selected.size === 0}>
          {busy ? 'Working…' : scheduledAt ? 'Schedule post' : 'Publish now'}
        </Button>
      </div>
    </div>
  );
}
