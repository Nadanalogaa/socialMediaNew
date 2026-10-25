import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  buildProjectFromBrief,
  parseBrief,
  parseBriefDirectives,
  sceneDurationFor,
  type LogoPosition,
  type MagicBrief,
  type ProjectAudio,
  type ReelProject,
} from '@socialboost/shared';
import { api, getFeatures, uploadAudio, uploadToCloudinary, type BrandKit, type MediaAsset, type SavedBrief } from '../lib/api';
import { applyBrandPlaceholders, brandFooter } from '../lib/brand';
import { GUEST_LIMITS, useGuest } from '../lib/guest';
import { Alert, Button, Spinner } from './ui';

const EXAMPLE = `Logo: top right
Footer: www.nadanaloga.com · 95668 66588

Scene 1 - Opening
Welcome to Our World of Fine Arts
NADANALOGA ✨
And add a photo

Scene 2 - What we teach
Discover Your Passion. Develop Your Talent.
Dance • Music • Art • Creativity

Scene 3 - Join us
Learn. Create. Perform. Grow.
Join Nadanaloga Fine Arts Academy [bold, yellow]
Contact: 095668 66588
Website: www.nadanaloga.com`;

/** What can go in square brackets at the end of a line. */
const INSTRUCTION_GROUPS: { title: string; words: string }[] = [
  { title: 'Look', words: 'bold · light · big · huge · small · caps' },
  { title: 'Colour', words: 'yellow · gold · red · orange · green · blue · pink · white · or #ff8800' },
  { title: 'Place', words: 'left · right · centre · gap (space above the line)' },
  { title: 'Font', words: 'serif · rounded · condensed · mono' },
  { title: 'Motion', words: 'fade · rise · pop · typewriter · letters · wave · still' },
  { title: 'Where', words: 'title · body · contact (if a line lands in the wrong place)' },
  {
    title: 'Every scene',
    words:
      'Above Scene 1: Logo: top right · QR: https://… · Footer: your text. Written inside a scene, QR: and Footer: apply to that scene only.',
  },
];

const DESCRIBE_EXAMPLE = `I run an educational institution named Sree Annai Fine Arts in Chennai. We teach Bharatanatyam, Carnatic vocal and keyboard for children from age 5 and for adults, with 15 years of experience and more than 400 students trained. Admissions for the July batch are open, weekend classes available. Mention a free demo class.`;

const STORY_LANGUAGES = ['English', 'Tamil', 'Tanglish', 'Hindi', 'Telugu', 'Kannada', 'Malayalam'];

const LOGO_POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom centre' },
];

type PhotoLayout = 'background' | 'blocks';

/** Older briefs stored one URL per scene; everything is a list now. */
function toPhotoLists(
  photos: Record<string | number, string | string[]> | undefined,
): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const [key, value] of Object.entries(photos ?? {})) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    if (list.length > 0) out[Number(key)] = list;
  }
  return out;
}

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
  initial,
  presetBrief,
}: {
  onClose: () => void;
  onCreate: (project: ReelProject, magic: MagicBrief, audio?: ProjectAudio) => void;
  /** The brief this reel was built from, so it reopens ready to edit. */
  initial?: MagicBrief;
  /** Text to start from (an idea), without being in edit mode. */
  presetBrief?: string;
}) {
  const { guest, lock } = useGuest();
  const [brief, setBrief] = useState(initial?.brief ?? presetBrief ?? '');
  // "Describe" lets the story be written for the user; "Write" is scene by scene.
  const [mode, setMode] = useState<'describe' | 'write'>(initial || presetBrief ? 'write' : 'describe');
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('English');
  const [sceneCount, setSceneCount] = useState(5);
  const [writing, setWriting] = useState(false);
  /** Set once a story was written: the scenes the story wants a photo in. */
  const [storyPhotoScenes, setStoryPhotoScenes] = useState<number[] | null>(null);
  /** Checklist items the user chose to go without. */
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [brandColor, setBrandColor] = useState(initial?.brandColor ?? '#4f46e5');
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? '#0f172a');
  const [library, setLibrary] = useState<MediaAsset[] | null>(null);
  /** Photos picked per scene, keyed by position in the brief. */
  const [scenePhotos, setScenePhotos] = useState<Record<number, string[]>>(() =>
    toPhotoLists(initial?.scenePhotos),
  );
  /** Backdrop or tiles, for scenes with a single photo. */
  const [photoLayout, setPhotoLayout] = useState<Record<number, PhotoLayout>>(
    initial?.photoLayout ?? {},
  );
  const [logo, setLogo] = useState<string | undefined>(initial?.logo);
  const [logoPosition, setLogoPosition] = useState<string>(initial?.logoPosition ?? '');
  /** Which scene — or the logo — the picker below is choosing for. */
  const [pickingFor, setPickingFor] = useState<number | 'logo' | null>(null);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [audio, setAudio] = useState<ProjectAudio | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  /** Every brief this workspace has built from, newest first. */
  const [history, setHistory] = useState<SavedBrief[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  /** The history entry this brief came from, so a rebuild updates it. */
  const [briefId, setBriefId] = useState<string | undefined>(initial?.id);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getFeatures().then((features) => {
      setAiAvailable(features.ai);
      // Without a model there is nothing to describe to.
      if (!features.ai && !guest) setMode('write');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (guest) {
      setHistory([]);
      return;
    }
    api
      .listBriefs()
      .then(({ briefs }) => setHistory(briefs))
      .catch(() => setHistory([]));
    // A new reel starts from the brand kit: its colours, logo and font.
    api
      .getBrand()
      .then((kit) => {
        setBrand(kit);
        if (initial) return;
        if (kit.primaryColor) setBrandColor(kit.primaryColor);
        if (kit.secondaryColor) setAccentColor(kit.secondaryColor);
        if (kit.logoUrl) setLogo((current) => current ?? kit.logoUrl ?? undefined);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadFromHistory(saved: SavedBrief) {
    setBrief(saved.brief);
    setBrandColor(saved.brandColor);
    setAccentColor(saved.accentColor);
    setScenePhotos(toPhotoLists(saved.scenePhotos));
    setPhotoLayout(
      Object.fromEntries(
        Object.entries(saved.options?.photoLayout ?? {}).map(([k, v]) => [Number(k), v]),
      ),
    );
    setLogo(saved.options?.logo);
    setLogoPosition(saved.options?.logoPosition ?? '');
    setDescription(saved.options?.description ?? '');
    setBriefId(saved.id);
    setShowHistory(false);
    setMode('write');
  }

  async function writeStory(instruction?: string) {
    if (guest) {
      lock('Writing the story for you');
      return;
    }
    if (description.trim().length < 10) {
      setError('Tell us a little more about the business first — a few sentences is enough.');
      return;
    }
    setWriting(true);
    setError(null);
    try {
      const story = await api.writeMagicStory({
        description: description.trim(),
        sceneCount,
        language,
        ...(instruction && brief.trim() ? { currentBrief: brief, instruction } : {}),
      });
      setBrief(story.brief);
      setStoryPhotoScenes(story.needs.photoScenes);
      setSkipped(new Set());
      setMode('write');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the story. Please try again.');
    } finally {
      setWriting(false);
    }
  }

  function skip(item: string) {
    setSkipped((prev) => new Set(prev).add(item));
  }

  function togglePhoto(sceneIndex: number, url: string) {
    setScenePhotos((prev) => {
      const current = prev[sceneIndex] ?? [];
      const next = current.includes(url)
        ? current.filter((item) => item !== url)
        : [...current, url].slice(0, 6);
      const copy = { ...prev };
      if (next.length === 0) delete copy[sceneIndex];
      else copy[sceneIndex] = next;
      return copy;
    });
  }

  function choosePicked(url: string) {
    if (pickingFor === 'logo') {
      setLogo(url);
      setPickingFor(null);
    } else if (pickingFor !== null) {
      togglePhoto(pickingFor, url);
    }
  }

  async function removeFromHistory(id: string) {
    setHistory((prev) => (prev ?? []).filter((entry) => entry.id !== id));
    if (id === briefId) setBriefId(undefined);
    try {
      await api.deleteBrief(id);
    } catch {
      // The list refreshes next time; a failed delete is not worth interrupting for.
    }
  }

  useEffect(() => {
    // A guest has no library: only what they add from their device.
    if (guest) return setLibrary([]);
    api
      .listMedia()
      .then(({ media }) => setLibrary(media.filter((asset) => asset.kind === 'image')))
      .catch(() => setLibrary([]));
  }, [guest]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Parsed as the user types, so the scene split is visible before committing.
  // {phone}, {website} and friends are filled from the brand kit first.
  const expanded = useMemo(() => applyBrandPlaceholders(brief, brand), [brief, brand]);
  const parsedScenes = useMemo(() => (expanded.trim() ? parseBrief(expanded) : []), [expanded]);
  // A guest's reel is three scenes; the rest of the brief waits for an account.
  const scenes = useMemo(() => {
    const visible = guest ? parsedScenes.slice(0, GUEST_LIMITS.scenes) : parsedScenes;
    return visible.map((scene, index) =>
      scene.wantsPhoto && skipped.has(`photo-${index}`) ? { ...scene, wantsPhoto: false } : scene,
    );
  }, [guest, parsedScenes, skipped]);
  const scenesHeld = parsedScenes.length - scenes.length;
  const directives = useMemo(() => parseBriefDirectives(expanded), [expanded]);
  const totalSeconds = scenes.reduce((total, scene) => total + sceneDurationFor(scene), 0);

  async function handleAudioFile(file: File) {
    setError(null);
    if (guest) {
      setAudio({ url: URL.createObjectURL(file), name: file.name, volume: 0.8, startSeconds: 0, fadeOut: true });
      return;
    }
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

  async function handlePhotoFile(file: File, target: number | 'logo') {
    setUploading(true);
    setError(null);
    if (guest) {
      // Stays on the device: a local URL the canvas can draw from.
      const url = URL.createObjectURL(file);
      const asset: MediaAsset = { id: url, kind: 'image', url, thumbnailUrl: null, width: null, height: null };
      setLibrary((prev) => [asset, ...(prev ?? [])]);
      if (target === 'logo') lock('A logo on every scene');
      else togglePhoto(target, url);
      setUploading(false);
      return;
    }
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
      if (target === 'logo') {
        setLogo(asset.url);
        setPickingFor(null);
      } else {
        togglePhoto(target, asset.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate() {
    if (scenes.length === 0) return;
    setBusy(true);

    // Remembered before the reel is built, so the brief is never lost even
    // if the reel is closed unsaved. A failure here must not block creating.
    let id = briefId;
    const options = {
      photoLayout: Object.fromEntries(
        Object.entries(photoLayout).map(([k, v]) => [String(k), v]),
      ) as Record<string, PhotoLayout>,
      ...(logo ? { logo } : {}),
      ...(logoPosition ? { logoPosition } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    try {
      if (guest) throw new Error('guest');
      const saved = await api.saveBrief({
        id,
        name: scenes[0]?.headline || brief.split('\n')[0]!.slice(0, 80),
        brief,
        scenePhotos: Object.fromEntries(
          Object.entries(scenePhotos)
            .filter(([, urls]) => urls.length > 0)
            .map(([k, v]) => [String(k), v]),
        ),
        options,
        brandColor,
        accentColor,
      });
      id = saved.id;
    } catch {
      // History is a convenience; the reel still gets built.
    }

    // QR codes are drawn here, once per distinct text, and carried as images.
    const qrTexts = new Set<string>();
    if (directives.qr) qrTexts.add(directives.qr);
    for (const scene of scenes) if (scene.qr) qrTexts.add(scene.qr);
    const qrImages: Record<string, string> = {};
    for (const text of qrTexts) {
      try {
        qrImages[text] = await QRCode.toDataURL(text, {
          margin: 1,
          width: 512,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      } catch {
        // Too long to encode: the scene simply goes without.
      }
    }

    // Logo and QR are part of the paid-for polish; a guest's brief builds without them.
    const effectiveDirectives = guest ? { ...directives, qr: undefined, logoPosition: undefined } : directives;
    const built = buildProjectFromBrief(scenes, {
        // Photos chosen for a scene win; "add a photo" draws on the library.
        scenePhotos: scenes.map((_, index) => scenePhotos[index]),
        photoLayout: scenes.map((_, index) => photoLayout[index]),
        photos: (library ?? []).map((asset) => asset.url),
        logo: guest ? undefined : logo,
        logoPosition: (logoPosition || undefined) as LogoPosition | undefined,
        qrImages: guest ? {} : qrImages,
        directives: effectiveDirectives,
        brandColor,
        accentColor,
      });
    if (brand?.fontFamily) {
      for (const scene of built.scenes) {
        for (const layer of scene.layers) {
          if (layer.type === 'text' && !layer.style.fontFamily) layer.style.fontFamily = brand.fontFamily;
        }
      }
    }

    onCreate(
      built,
      {
        id,
        brief,
        scenePhotos,
        photoLayout,
        logo,
        logoPosition: logoPosition || undefined,
        brandColor,
        accentColor,
      },
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
              {initial
                ? 'Edit the brief and the reel is rebuilt. Hand-made changes to scenes are replaced.'
                : mode === 'describe'
                  ? 'Describe your business in your own words. The story, scenes and layout are written for you.'
                  : 'Write what each scene should say. The reel is built for you, and you can change anything afterwards.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 text-sm ${
                showHistory
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title="Briefs you have built before"
            >
              🕘 History{history && history.length > 0 ? ` (${history.length})` : ''}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {showHistory && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Previous briefs
            </p>
            {history === null ? (
              <Spinner />
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nothing yet — every brief you build from is kept here, so you can come back and
                change it.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className={`flex items-center gap-2 rounded-lg border bg-white p-2 ${
                      entry.id === briefId ? 'border-brand-400' : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadFromHistory(entry)}
                      className="min-w-0 flex-1 text-left"
                      title="Load this brief"
                    >
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {entry.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {new Date(entry.updatedAt).toLocaleString()} ·{' '}
                        {parseBrief(entry.brief).length} scenes
                        {Object.values(toPhotoLists(entry.scenePhotos)).flat().length > 0
                          ? ` · ${Object.values(toPhotoLists(entry.scenePhotos)).flat().length} photos`
                          : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadFromHistory(entry)}
                      className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromHistory(entry.id)}
                      aria-label="Delete this brief"
                      className="shrink-0 rounded-md px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(aiAvailable || guest) && (
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {(
              [
                ['describe', '✨ Describe your business'],
                ['write', '✍️ Write the scenes yourself'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  mode === value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
            {mode === 'write' && brief.trim() && description.trim() && (
              <span className="ml-auto text-xs text-slate-500">
                Written from your description ·{' '}
                <button type="button" onClick={() => setMode('describe')} className="font-medium text-brand-600 hover:underline">
                  change it
                </button>
              </span>
            )}
          </div>
        )}

        {mode === 'describe' ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder={DESCRIBE_EXAMPLE}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="text-slate-600">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                {STORY_LANGUAGES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <label className="ml-1 text-slate-600">Scenes</label>
              <select
                value={sceneCount}
                onChange={(e) => setSceneCount(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                {[3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {description.trim() === '' && (
                <button
                  type="button"
                  onClick={() => setDescription(DESCRIBE_EXAMPLE)}
                  className="font-medium text-brand-600 hover:underline"
                >
                  Use the example
                </button>
              )}
              <Button
                className="ml-auto !py-1.5 !text-xs"
                onClick={() => void writeStory()}
                disabled={writing}
              >
                {writing ? 'Writing the story…' : brief.trim() ? '✨ Write it again' : '✨ Write the story'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Say what you do, where you are, who it is for, what makes you good at it, and what you
              are offering now. Your brand kit's name, phone and website are used as they are; nothing
              else is invented. Change any line afterwards.
            </p>
          </div>
        ) : (
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={11}
            placeholder={EXAMPLE}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        )}

        {mode === 'write' && (

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {brand && (brand.phone || brand.website) && !/^\s*footer\s*:/im.test(brief) && (
              <button
                type="button"
                onClick={() => setBrief((b) => `Footer: ${brandFooter(brand)}\n${b}`)}
                className="mr-2 font-medium text-brand-600 hover:underline"
              >
                + Add your contact footer
              </button>
            )}
            Start a line with <strong>Scene 1</strong> — a name after it, like{' '}
            <strong>Scene 1 - Opening</strong>, is used as the scene's title. Write{' '}
            <strong>add a photo</strong> on its own line where you want a picture. Lines starting
            with <strong>Contact:</strong> or <strong>Website:</strong> are set apart. Above
            Scene 1, <strong>Logo:</strong>, <strong>QR: https://…</strong> and{' '}
            <strong>Footer:</strong> go on every scene. Style any line with brackets at its
            end, like <strong>[bold, big, yellow]</strong> —{' '}
            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="font-medium text-brand-600 hover:underline"
            >
              {showInstructions ? 'hide the list' : 'see all'}
            </button>
            .
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
        )}

        {mode === 'write' && showInstructions && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {INSTRUCTION_GROUPS.map((group) => (
              <Fragment key={group.title}>
                <dt className="font-medium text-slate-900">{group.title}</dt>
                <dd>{group.words}</dd>
              </Fragment>
            ))}
            <dd className="col-span-2 pt-1 text-slate-500">
              Combine them in one bracket: <strong>Admissions open [gap, bold, gold, pop]</strong>.
              Each line in the brief stays as one line in the reel.
            </dd>
          </dl>
        )}

        {storyPhotoScenes !== null && mode === 'write' && scenes.length > 0 && (() => {
          const photoScenes = scenes
            .map((_, index) => index)
            .filter((index) => scenes[index]!.wantsPhoto && !scenePhotos[index]?.length);
          const wantLogo = !logo && !skipped.has('logo');
          const wantAudio = !audio && !skipped.has('audio');
          const open = (wantLogo ? 1 : 0) + photoScenes.length + (wantAudio ? 1 : 0);
          return (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-800">
                {open > 0 ? 'Before we build — a few quick questions' : 'All set — create the reel below'}
              </p>
              {open > 0 && (
                <ul className="space-y-1.5 text-sm text-slate-800">
                  {wantLogo && (
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">Do you want your logo on every scene?</span>
                      <button type="button" onClick={() => setPickingFor('logo')} className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
                        Add logo
                      </button>
                      <button type="button" onClick={() => skip('logo')} className="text-xs text-slate-600 hover:underline">
                        No logo
                      </button>
                    </li>
                  )}
                  {photoScenes.length > 0 && (
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Scene{photoScenes.length === 1 ? '' : 's'} {photoScenes.map((i) => i + 1).join(', ')} would look better
                        with a photo of your business.
                      </span>
                      {photoScenes.map((index) => (
                        <button key={index} type="button" onClick={() => setPickingFor(index)} className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
                          Photo for scene {index + 1}
                        </button>
                      ))}
                      <button type="button" onClick={() => photoScenes.forEach((index) => skip(`photo-${index}`))} className="text-xs text-slate-600 hover:underline">
                        Use colour backgrounds
                      </button>
                    </li>
                  )}
                  {wantAudio && (
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">Do you want music or a voice-over? You can add it later too.</span>
                      <button type="button" onClick={() => audioInput.current?.click()} className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
                        Add audio
                      </button>
                      <button type="button" onClick={() => skip('audio')} className="text-xs text-slate-600 hover:underline">
                        Not now
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })()}

        {scenes.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {scenes.length} scene{scenes.length === 1 ? '' : 's'} · {totalSeconds.toFixed(1)}s
              {scenesHeld > 0 && (
                <button type="button" onClick={() => lock('More than 3 scenes')} className="ml-2 normal-case tracking-normal text-brand-600 hover:underline">
                  🔒 {scenesHeld} more scene{scenesHeld === 1 ? '' : 's'} with a free account
                </button>
              )}
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
                    {(scene.qr || scene.footer.length > 0) && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {scene.qr && (
                          <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">
                            QR · {scene.qr}
                          </span>
                        )}
                        {scene.footer.map((line) => (
                          <span
                            key={line}
                            className="rounded bg-slate-100 px-1 text-[10px] text-slate-600"
                          >
                            Footer · {line}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>

                  {/* Photos per scene, chosen or uploaded right here. */}
                  <button
                    onClick={() => setPickingFor(pickingFor === index ? null : index)}
                    className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      pickingFor === index ? 'border-brand-500' : 'border-slate-200'
                    }`}
                    title="Choose photos for this scene"
                  >
                    {scenePhotos[index]?.length ? (
                      scenePhotos[index].length === 1 ? (
                        <img src={scenePhotos[index][0]} alt="" className="h-12 w-12 object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 grid-cols-2 gap-px bg-slate-200">
                          {scenePhotos[index].slice(0, 4).map((url, n) => (
                            <img key={url + n} src={url} alt="" className="h-full w-full object-cover" />
                          ))}
                        </span>
                      )
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
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    {pickingFor === 'logo'
                      ? 'Logo — shown on every scene'
                      : `Photos for scene ${pickingFor + 1} — tap to add or remove`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => photoInput.current?.click()}
                      disabled={uploading}
                      className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                    >
                      {uploading ? 'Uploading…' : 'Upload new'}
                    </button>
                    {pickingFor !== 'logo' && scenePhotos[pickingFor]?.length ? (
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
                        Remove all
                      </button>
                    ) : null}
                    {pickingFor === 'logo' && logo && (
                      <button
                        onClick={() => {
                          setLogo(undefined);
                          setPickingFor(null);
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      onClick={() => setPickingFor(null)}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      Done
                    </button>
                  </div>
                </div>

                {pickingFor !== 'logo' && (scenePhotos[pickingFor]?.length ?? 0) > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {scenePhotos[pickingFor]!.length === 1 ? (
                      (['background', 'blocks'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() =>
                            setPhotoLayout((prev) => ({ ...prev, [pickingFor]: mode }))
                          }
                          className={`rounded-full border px-2.5 py-0.5 ${
                            (photoLayout[pickingFor] ?? 'background') === mode
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {mode === 'background' ? 'Full background' : 'Photo block with text'}
                        </button>
                      ))
                    ) : (
                      <span className="text-slate-500">
                        {scenePhotos[pickingFor]!.length} photos — shown as equal blocks under the
                        headline (up to 6).
                      </span>
                    )}
                  </div>
                )}

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
                          onClick={() => choosePicked(asset.url)}
                          className={`relative block w-full overflow-hidden rounded border-2 ${
                            (
                              pickingFor === 'logo'
                                ? logo === asset.url
                                : scenePhotos[pickingFor]?.includes(asset.url)
                            )
                              ? 'border-brand-500'
                              : 'border-transparent hover:border-slate-300'
                          }`}
                        >
                          {pickingFor !== 'logo' && scenePhotos[pickingFor]?.includes(asset.url) && (
                            <span className="absolute left-0.5 top-0.5 rounded bg-brand-600 px-1 text-[10px] font-medium text-white">
                              {scenePhotos[pickingFor]!.indexOf(asset.url) + 1}
                            </span>
                          )}
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

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">Logo</label>
              <button
                onClick={() => setPickingFor(pickingFor === 'logo' ? null : 'logo')}
                className={`overflow-hidden rounded-lg border-2 ${
                  pickingFor === 'logo' ? 'border-brand-500' : 'border-slate-200'
                }`}
                title="A logo shown on every scene"
              >
                {logo ? (
                  <img src={logo} alt="" className="h-9 w-16 bg-slate-100 object-contain" />
                ) : (
                  <span className="flex h-9 w-16 items-center justify-center bg-slate-50 text-[10px] text-slate-400">
                    ＋ logo
                  </span>
                )}
              </button>
              {logo && (
                <select
                  value={logoPosition || directives.logoPosition || 'top-right'}
                  onChange={(e) => setLogoPosition(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  title="Where the logo sits"
                >
                  {LOGO_POSITIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <label className="ml-2 text-xs text-slate-600">Colours</label>
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
            {busy
              ? 'Building…'
              : initial
                ? `Rebuild ${scenes.length} scene reel`
                : `Create ${scenes.length || ''} scene reel`}
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
