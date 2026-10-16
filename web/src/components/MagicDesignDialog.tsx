import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildProjectFromBrief,
  parseBrief,
  sceneDurationFor,
  type ProjectAudio,
  type ReelProject,
} from '@socialboost/shared';
import { api, uploadAudio, uploadToCloudinary, type MediaAsset } from '../lib/api';
import { Alert, Button, Spinner } from './ui';

const EXAMPLE = `Scene 1
Welcome to Our World of Fine Arts
NADANALOGA ✨
And add a photo

Scene 2
Discover Your Passion. Develop Your Talent.
Dance • Music • Art • Creativity

Scene 3
Learn. Create. Perform. Grow.
Join Nadanaloga Fine Arts Academy
Contact: 095668 66588
Website: www.nadanaloga.com`;

/**
 * Builds a whole reel from a written brief.
 *
 * The scene structure is read from the text itself — "Scene 1", then its
 * lines — so nothing is guessed and no language model is involved. A brief
 * without markers is split on paragraphs, then sentences.
 */
export function MagicDesignDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (project: ReelProject, audio?: ProjectAudio) => void;
}) {
  const [brief, setBrief] = useState('');
  const [brandColor, setBrandColor] = useState('#4f46e5');
  const [accentColor, setAccentColor] = useState('#0f172a');
  const [library, setLibrary] = useState<MediaAsset[] | null>(null);
  /** A photo picked for one scene, keyed by its position in the brief. */
  const [scenePhotos, setScenePhotos] = useState<Record<number, string>>({});
  /** Which scene the picker below is choosing for. */
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [audio, setAudio] = useState<ProjectAudio | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listMedia()
      .then(({ media }) => setLibrary(media.filter((asset) => asset.kind === 'image')))
      .catch(() => setLibrary([]));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Parsed as the user types, so the scene split is visible before committing.
  const scenes = useMemo(() => (brief.trim() ? parseBrief(brief) : []), [brief]);
  const totalSeconds = scenes.reduce((total, scene) => total + sceneDurationFor(scene), 0);

  async function handleAudioFile(file: File) {
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadAudio(file, signature);
      setAudio({
        url: uploaded.url,
        name: file.name,
        volume: 0.8,
        startSeconds: 0,
        fadeOut: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that sound.');
    }
  }

  async function handlePhotoFile(file: File, sceneIndex: number) {
    setUploading(true);
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      const asset = await api.registerMedia({
        kind: 'image',
        url: uploaded.url,
        width: uploaded.width,
        height: uploaded.height,
      });
      setLibrary((prev) => [asset, ...(prev ?? [])]);
      setScenePhotos((prev) => ({ ...prev, [sceneIndex]: asset.url }));
      setPickingFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  }

  function handleCreate() {
    if (scenes.length === 0) return;
    setBusy(true);
    onCreate(
      buildProjectFromBrief(scenes, {
        // A photo chosen for a scene wins; the library fills the rest.
        scenePhotos: scenes.map((_, index) => scenePhotos[index]),
        photos: (library ?? []).map((asset) => asset.url),
        brandColor,
        accentColor,
      }),
      audio,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Magic Design"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">✨ Magic Design</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Write what each scene should say. The reel is built for you, and you can change
              anything afterwards.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {error && <Alert>{error}</Alert>}

        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={11}
          placeholder={EXAMPLE}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Start a line with <strong>Scene 1</strong> — a name after it, like{' '}
            <strong>Scene 1 - Opening</strong>, is used as the scene's title. Write{' '}
            <strong>add a photo</strong> on its own line where you want a picture. Lines starting
            with <strong>Contact:</strong> or <strong>Website:</strong> are set apart.
          </span>
          {brief.trim() === '' && (
            <button
              onClick={() => setBrief(EXAMPLE)}
              className="shrink-0 font-medium text-brand-600 hover:underline"
            >
              Use the example
            </button>
          )}
        </div>

        {scenes.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {scenes.length} scene{scenes.length === 1 ? '' : 's'} · {totalSeconds.toFixed(1)}s
            </p>
            <ul className="space-y-2">
              {scenes.map((scene, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-600 text-xs font-medium text-white">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium text-slate-900">
                      {scene.headline || <em className="text-slate-400">No headline</em>}
                    </span>
                    {scene.label && (
                      <span className="block text-xs text-slate-400">{scene.label}</span>
                    )}
                    {scene.body.length > 0 && (
                      <span className="block text-xs text-slate-500">{scene.body.join(' · ')}</span>
                    )}
                    {scene.contact.length > 0 && (
                      <span className="block text-xs text-slate-500">
                        {scene.contact.join(' · ')}
                      </span>
                    )}
                  </span>

                  {/* A photo per scene, chosen or uploaded right here. */}
                  <button
                    onClick={() => setPickingFor(pickingFor === index ? null : index)}
                    className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      pickingFor === index ? 'border-brand-500' : 'border-slate-200'
                    }`}
                    title="Choose a photo for this scene"
                  >
                    {scenePhotos[index] ? (
                      <img
                        src={scenePhotos[index]}
                        alt=""
                        className="h-12 w-12 object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 flex-col items-center justify-center bg-slate-50 text-[10px] leading-tight text-slate-400">
                        <span className="text-base leading-none">＋</span>
                        photo
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {pickingFor !== null && (
              <div className="mt-2 rounded-lg border border-brand-200 bg-white p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Photo for scene {pickingFor + 1}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => photoInput.current?.click()}
                      disabled={uploading}
                      className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                    >
                      {uploading ? 'Uploading…' : 'Upload new'}
                    </button>
                    {scenePhotos[pickingFor] && (
                      <button
                        onClick={() =>
                          setScenePhotos((prev) => {
                            const next = { ...prev };
                            delete next[pickingFor];
                            return next;
                          })
                        }
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {library === null ? (
                  <Spinner className="h-4 w-4 text-slate-400" />
                ) : library.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No photos yet — upload one, or leave it and this scene gets a colour
                    background.
                  </p>
                ) : (
                  <ul className="grid grid-cols-8 gap-1">
                    {library.slice(0, 16).map((asset) => (
                      <li key={asset.id}>
                        <button
                          onClick={() => {
                            setScenePhotos((prev) => ({ ...prev, [pickingFor]: asset.url }));
                            setPickingFor(null);
                          }}
                          className={`block w-full overflow-hidden rounded border-2 ${
                            scenePhotos[pickingFor] === asset.url
                              ? 'border-brand-500'
                              : 'border-transparent hover:border-slate-300'
                          }`}
                        >
                          <img
                            src={asset.thumbnailUrl ?? asset.url}
                            alt=""
                            className="aspect-square w-full object-cover"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-700">Sound</p>
            {audio ? (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{audio.name}</span>
                <button
                  onClick={() => setAudio(undefined)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="!py-1 !text-xs"
                onClick={() => audioInput.current?.click()}
              >
                Add music or a voiceover
              </Button>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Use audio you have the rights to. You can add or change it later.
            </p>

            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-slate-600">Colours</label>
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                title="Main colour"
                className="h-7 w-10 cursor-pointer rounded border border-slate-300"
              />
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                title="Alternate colour"
                className="h-7 w-10 cursor-pointer rounded border border-slate-300"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy || scenes.length === 0}>
            {busy ? 'Building…' : `Create ${scenes.length || ''} scene reel`}
          </Button>
        </div>

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && pickingFor !== null) void handlePhotoFile(file, pickingFor);
            e.target.value = '';
          }}
        />

        <input
          ref={audioInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleAudioFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
