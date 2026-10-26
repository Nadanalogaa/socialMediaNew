import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  MAGIC_INDUSTRIES,
  MAGIC_TEMPLATES,
  buildProjectFromBrief,
  parseBrief,
  parseBriefDirectives,
  sceneDurationFor,
  type LogoPosition,
  type MagicBrief,
  type ProjectAudio,
  type ReelProject,
} from '@socialboost/shared';
import { api, getFeatures, uploadAudio, uploadToCloudinary, type BrandKit, type MagicStory, type MediaAsset, type SavedBrief, type StockPhoto } from '../lib/api';
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

/** Changes people ask for most, one tap away. */
const CHAT_SUGGESTIONS = ['Shorter', 'More energetic', 'Add one more scene about our teachers', 'Make the offer the first scene', 'Change to Tamil'];

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
 * Builds a whole reel from a description or a written brief: a full-screen
 * page with the story on the left and the look (logo, colours, sound) on the
 * right. The scene structure is read from the brief text itself, so what is
 * on screen is exactly what gets built.
 */
export function MagicDesignDialog({
  onClose,
  onCreate,
  initial,
  presetBrief,
  presetDescription,
  presetLanguage,
}: {
  onClose: () => void;
  onCreate: (project: ReelProject, magic: MagicBrief, audio?: ProjectAudio) => void;
  /** The brief this reel was built from, so it reopens ready to edit. */
  initial?: MagicBrief;
  /** Text to start from (an idea), without being in edit mode. */
  presetBrief?: string;
  /** A description typed on the website: the story is written at once. */
  presetDescription?: string;
  presetLanguage?: string;
}) {
  const { guest, lock } = useGuest();
  const [brief, setBrief] = useState(initial?.brief ?? presetBrief ?? '');
  // "Describe" lets the story be written for the user; "Write" is scene by scene.
  // "Describe" writes the story; "chat" changes it in conversation; "write" is the raw scene text.
  // Once a reel exists the default is the pictures: that is what people change most.
  const [mode, setMode] = useState<'describe' | 'images' | 'chat' | 'write'>(initial ? 'images' : presetBrief ? 'write' : 'describe');
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; text: string }[]>(initial?.conversation ?? []);
  const [chatInput, setChatInput] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [description, setDescription] = useState(initial?.description ?? presetDescription ?? '');
  const [language, setLanguage] = useState(presetLanguage ?? 'English');
  const [showTemplates, setShowTemplates] = useState(false);
  const [industry, setIndustry] = useState<string>('All');
  const autoWritten = useRef(false);
  /** Set when the website sent the description: the reel is built as soon as the story is in. */
  const autoCreate = useRef(false);
  const [sceneCount, setSceneCount] = useState(5);
  const [writing, setWriting] = useState(false);
  /** Set once a story was written: the scenes the story wants a photo in. */
  const [storyPhotoScenes, setStoryPhotoScenes] = useState<number[] | null>(null);
  /** Checklist items the user chose to go without. */
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [stockPhotos, setStockPhotos] = useState(false);
  /** Stock alternatives per scene: the search that found them and its results. */
  const [suggestions, setSuggestions] = useState<Record<number, { query: string; photos: StockPhoto[] }>>({});
  const [stockQuery, setStockQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
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
  /** The chooser opened from the picture strip at the top, not from the scene list. */
  const [pickInStrip, setPickInStrip] = useState(false);
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
  const logoCardRef = useRef<HTMLDivElement>(null);

  /** Opens the logo chooser and brings it into view, from wherever it was asked. */
  function focusLogo() {
    setPickingFor('logo');
    setTimeout(() => logoCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  /** Opens a scene's photo chooser and scrolls to it. */
  function focusScene(index: number) {
    setStockQuery('');
    setPickInStrip(false);
    setPickingFor(index);
    setTimeout(() => document.getElementById(`magic-scene-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  useEffect(() => {
    void getFeatures().then((features) => {
      setAiAvailable(features.ai);
      setStockPhotos(Boolean(features.stockPhotos));
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
    setTurns([]);
    setMode('images');
  }

  async function writeStory(instruction?: string, text: string = description): Promise<MagicStory | null> {
    // A reel written by hand has no description; the scenes themselves stand in.
    const source = text.trim().length >= 10 ? text.trim() : brief.trim();
    if (source.length < 10) {
      setError('Tell us a little more about the business first — a few sentences is enough.');
      return null;
    }
    const revising = Boolean(instruction && brief.trim());
    setWriting(true);
    setError(null);
    setShowTemplates(false);
    try {
      const keepPhotoScenes = revising
        ? Object.entries(scenePhotos).filter(([, urls]) => urls.length > 0).map(([k]) => Number(k))
        : [];
      const input = {
        description: source,
        sceneCount,
        language,
        ...(revising ? { currentBrief: brief, instruction, keepPhotoScenes } : {}),
      };
      const story = guest ? await api.writeMagicStoryAsGuest(input) : await api.writeMagicStory(input);
      setBrief(story.brief);
      setStoryPhotoScenes(story.needs.photoScenes);
      setSkipped(new Set());
      // Pictures found for the story go straight into their scenes; the
      // alternatives wait in the chooser for anyone who wants a different one.
      const picked: Record<number, string[]> = {};
      const replaced: Record<number, string[]> = {};
      const found: Record<number, { query: string; photos: StockPhoto[] }> = {};
      const imported: MediaAsset[] = [];
      for (const scene of story.photoScenes) {
        if (scene.alternatives.length > 0) found[scene.index] = { query: scene.query, photos: scene.alternatives };
        if (scene.chosen) {
          (scene.replace ? replaced : picked)[scene.index] = [scene.chosen.url];
          imported.push(scene.chosen);
        }
      }
      if (revising) {
        // Photos already in place stay unless a new one was asked for; scenes
        // without one take the new picks.
        setScenePhotos((prev) => ({ ...picked, ...prev, ...replaced }));
        setSuggestions((prev) => ({ ...prev, ...found }));
      } else {
        setScenePhotos(picked);
        setPhotoLayout({});
        setSuggestions(found);
      }
      if (imported.length > 0) setLibrary((prev) => [...imported, ...(prev ?? [])]);
      // A fresh story lands on its pictures; a change asked for in the chat stays there.
      setMode((current) => (current === 'describe' ? 'images' : current));
      return story;
    } catch (err) {
      // The page stays open for the user to try again; nothing builds on its own.
      autoCreate.current = false;
      setError(err instanceof Error ? err.message : 'Could not write the story. Please try again.');
      return null;
    } finally {
      setWriting(false);
    }
  }


  function skip(item: string) {
    setSkipped((prev) => new Set(prev).add(item));
  }

  /** Fills a template's placeholders from the brand kit, or leaves a blank to type into. */
  function fillTemplate(text: string): string {
    const withBrand = applyBrandPlaceholders(text, brand);
    return withBrand.replace(/\{city\}/gi, brand?.address?.split(',').pop()?.trim() || 'Chennai').replace(/\{(name|phone|website)\}/gi, '');
  }

  function useTemplate(slug: string, how: 'write' | 'scenes') {
    const template = MAGIC_TEMPLATES.find((item) => item.slug === slug);
    if (!template) return;
    const text = fillTemplate(template.description).replace(/^\s+is /, 'We are ');
    setDescription(text);
    if (how === 'write' && (aiAvailable || guest)) {
      void writeStory(undefined, text);
      return;
    }
    setBrief(fillTemplate(template.brief).replace(/^(Contact|Website):\s*$/gm, '').replace(/\n{3,}/g, '\n\n'));
    setStoryPhotoScenes(null);
    setShowTemplates(false);
    setMode('images');
  }

  // Arriving from the website with a description: the story is written at once.
  useEffect(() => {
    if (!presetDescription || autoWritten.current || aiAvailable === null) return;
    if (!aiAvailable && !guest) return;
    autoWritten.current = true;
    autoCreate.current = true;
    void writeStory(undefined, presetDescription);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetDescription, aiAvailable, guest]);

  /** Looks for stock photos for one scene, from the chooser's search box. */
  async function findStockPhotos(sceneIndex: number, query: string) {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const { photos } = await api.searchStockPhotos(query.trim());
      setSuggestions((prev) => ({ ...prev, [sceneIndex]: { query: query.trim(), photos } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search for photos.');
    } finally {
      setSearching(false);
    }
  }

  /** A stock photo picked for a scene is imported first, so it is the tenant's own. */
  async function useStockPhoto(sceneIndex: number, photo: StockPhoto) {
    setImporting(photo.id);
    setError(null);
    try {
      const asset = await api.pickStockPhoto(photo);
      setLibrary((prev) => [asset, ...(prev ?? []).filter((item) => item.id !== asset.id)]);
      setScenePhotos((prev) => ({ ...prev, [sceneIndex]: [asset.url] }));
      setPhotoLayout((prev) => ({ ...prev, [sceneIndex]: 'background' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that photo.');
    } finally {
      setImporting(null);
    }
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
    const visible = guest && GUEST_LIMITS.enforce ? parsedScenes.slice(0, GUEST_LIMITS.scenes) : parsedScenes;
    return visible.map((scene, index) =>
      scene.wantsPhoto && skipped.has(`photo-${index}`) ? { ...scene, wantsPhoto: false } : scene,
    );
  }, [guest, parsedScenes, skipped]);
  const scenesHeld = parsedScenes.length - scenes.length;
  const directives = useMemo(() => parseBriefDirectives(expanded), [expanded]);
  const totalSeconds = scenes.reduce((total, scene) => total + sceneDurationFor(scene), 0);

  /** One turn of the conversation: the change is asked for, applied, and reported back. */
  async function sendChange(text: string) {
    const message = text.trim();
    if (!message || writing) return;
    setChatInput('');
    const before = parsedScenes;
    setTurns((prev) => [...prev, { role: 'user', text: message }]);
    const story = await writeStory(message);
    if (!story) {
      setTurns((prev) => [...prev, { role: 'assistant', text: 'Sorry, that did not go through. Please try again.' }]);
      return;
    }
    // What changed, read from the answer itself: words, pictures, effects.
    const after = parseBrief(applyBrandPlaceholders(story.brief, brand));
    const changedText = after.map((scene, i) => (scene.headline !== before[i]?.headline || scene.body.join('|') !== before[i]?.body.join('|') ? i + 1 : 0)).filter(Boolean);
    const newEffects = after.map((scene, i) => (scene.effect && scene.effect !== before[i]?.effect ? i + 1 : 0)).filter(Boolean);
    const globalEffect = parseBriefDirectives(story.brief).effect;
    const newPhotos = story.photoScenes.filter((scene) => scene.replace && scene.chosen).map((scene) => scene.index + 1);
    const askedPhotos = story.photoScenes.filter((scene) => scene.replace && !scene.chosen).map((scene) => scene.index + 1);
    const parts: string[] = [];
    if (after.length !== before.length) parts.push(`the reel now has ${after.length} scenes`);
    else if (changedText.length > 0) parts.push(`the words on scene${changedText.length === 1 ? '' : 's'} ${changedText.join(', ')} changed`);
    if (newPhotos.length > 0) parts.push(`new picture${newPhotos.length === 1 ? '' : 's'} on scene${newPhotos.length === 1 ? '' : 's'} ${newPhotos.join(', ')}`);
    if (askedPhotos.length > 0) parts.push(`no stock photo matched for scene${askedPhotos.length === 1 ? '' : 's'} ${askedPhotos.join(', ')} — tap the photo box to search or upload`);
    if (globalEffect) parts.push(`${globalEffect} effect on every scene`);
    else if (newEffects.length > 0) parts.push(`${after[newEffects[0]! - 1]!.effect} effect on scene${newEffects.length === 1 ? '' : 's'} ${newEffects.join(', ')}`);
    const what = parts.length > 0 ? `Done — ${parts.join('; ')}.` : 'Done — nothing needed to change for that; try saying which scene, or what the picture should show.';
    setTurns((prev) => [...prev, { role: 'assistant', text: initial ? `${what} Rebuilding the reel…` : `${what} Press Create when you are happy, or ask for more.` }]);
    if (initial && parts.length > 0) autoCreate.current = true;
  }

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);

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

  /** Where the next chosen file goes: a scene (replacing its picture), the logo, or just the library. */
  const uploadTarget = useRef<{ target: number | 'logo' | 'library'; replace: boolean } | null>(null);

  function openUpload(target: number | 'logo' | 'library', replace = true) {
    uploadTarget.current = { target, replace };
    if (typeof target === 'number') setPickingFor(target);
    photoInput.current?.click();
  }

  /** Puts a photo on a scene: in place of what was there, or added as a tile. */
  function placePhoto(sceneIndex: number, url: string, replace: boolean) {
    if (replace) {
      setScenePhotos((prev) => ({ ...prev, [sceneIndex]: [url] }));
      setPhotoLayout((prev) => ({ ...prev, [sceneIndex]: 'background' }));
    } else {
      togglePhoto(sceneIndex, url);
    }
  }

  async function handlePhotoFile(file: File, target: number | 'logo' | 'library', replace = false) {
    setUploading(true);
    setError(null);
    if (guest) {
      // Stays on the device: a local URL the canvas can draw from.
      const url = URL.createObjectURL(file);
      const asset: MediaAsset = { id: url, kind: 'image', url, thumbnailUrl: null, width: null, height: null };
      setLibrary((prev) => [asset, ...(prev ?? [])]);
      if (target === 'logo') lock('A logo on every scene');
      else if (typeof target === 'number') placePhoto(target, url, replace);
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
      } else if (typeof target === 'number') {
        placePhoto(target, asset.url, replace);
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
    const effectiveDirectives = guest && GUEST_LIMITS.enforce ? { ...directives, qr: undefined, logoPosition: undefined } : directives;
    const built = buildProjectFromBrief(scenes, {
        // Photos chosen for a scene win; "add a photo" draws on the library.
        scenePhotos: scenes.map((_, index) => scenePhotos[index]),
        photoLayout: scenes.map((_, index) => photoLayout[index]),
        photos: [],
        logo: guest && GUEST_LIMITS.enforce ? undefined : logo,
        logoPosition: (logoPosition || undefined) as LogoPosition | undefined,
        qrImages: guest && GUEST_LIMITS.enforce ? {} : qrImages,
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
        description: description.trim() || undefined,
        conversation: turns,
      },
      audio,
    );
  }

  // The story from the website's description is here: straight to the reel.
  useEffect(() => {
    if (!autoCreate.current || writing || busy || storyPhotoScenes === null || scenes.length === 0) return;
    autoCreate.current = false;
    void handleCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing, busy, storyPhotoScenes, scenes.length]);

  /**
   * The pictures tab: every scene as a card. Tapping a picture opens the
   * device's file chooser at once; "More" offers the AI's alternatives, a
   * search box and the library; the library on the right also drops photos
   * onto the selected scene.
   */
  function renderImagesTab() {
    if (scenes.length === 0) return null;
    const open = typeof pickingFor === 'number' && pickInStrip ? pickingFor : null;
    return (
      <div>
        <p className="mb-3 text-sm text-slate-600">
          <strong className="text-slate-900">Tap a picture to replace it with your own photo.</strong> Or choose one from{' '}
          <em>Your photos</em> on the right after selecting a scene.
        </p>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {scenes.map((scene, index) => {
            const photo = scenePhotos[index]?.[0];
            const selected = typeof pickingFor === 'number' && pickingFor === index;
            return (
              <li key={index} className={`rounded-xl border-2 p-1.5 ${selected ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPickInStrip(false);
                    openUpload(index, true);
                  }}
                  className="group relative block aspect-[9/16] w-full overflow-hidden rounded-lg bg-slate-100"
                  title={`Scene ${index + 1}: choose a photo from your device`}
                >
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full flex-col items-center justify-center text-xs text-slate-500">
                      <span className="text-2xl">＋</span>add photo
                    </span>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">{index + 1}</span>
                  <span className="absolute inset-x-0 bottom-0 bg-brand-600/90 py-1 text-center text-[11px] font-medium text-white">
                    {uploading && selected ? 'Uploading…' : '⬆ Upload photo'}
                  </span>
                </button>
                <p className="mt-1 truncate text-center text-[11px] text-slate-600" title={scene.headline}>
                  {scene.headline || `Scene ${index + 1}`}
                </p>
                <div className="mt-1 flex justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                        setStockQuery('');
                      setPickInStrip(!(open === index));
                      setPickingFor(index);
                    }}
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] ${open === index ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                    title="Alternatives, search and your library"
                  >
                    🔍 More
                  </button>
                  {photo && (
                    <button
                      type="button"
                      onClick={() => {
                        setScenePhotos((prev) => {
                          const next = { ...prev };
                          delete next[index];
                          return next;
                        });
                        skip(`photo-${index}`);
                      }}
                      className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
                      title="No picture on this scene"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {open !== null && (
          <div className="mt-3 rounded-xl border border-brand-200 bg-white p-2">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-800">Scene {open + 1} — other ways to pick:</span>
              {(aiAvailable || guest) && (
                <button
                  type="button"
                  disabled={writing}
                  onClick={() => void sendChange(`Scene ${open + 1}: use a different picture that fits it better`)}
                  className="rounded-full bg-brand-600 px-2.5 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  ✨ Let AI pick another
                </button>
              )}
            </div>
            {renderPicker(open)}
          </div>
        )}
        {initial && (
          <p className="mt-3 text-xs text-slate-500">
            Done with the pictures? Press <strong>Rebuild</strong> at the top to see them in the reel.
          </p>
        )}
      </div>
    );
  }

  /** The photo or logo chooser, drawn where the choice is being made. */
  function renderPicker(target: number | 'logo') {
    const forLogo = target === 'logo';
    const chosen = forLogo ? [] : (scenePhotos[target] ?? []);
    const grid = forLogo ? library : (library ?? []).filter((asset) => asset.url !== logo);
    return (
      <div className="mt-2 rounded-lg border border-brand-200 bg-white p-2">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">
            {forLogo ? 'Pick your logo' : `Photos for scene ${target + 1} — tap to add or remove`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={uploading}
              className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload from device'}
            </button>
            {!forLogo && chosen.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setScenePhotos((prev) => {
                    const next = { ...prev };
                    delete next[target];
                    return next;
                  })
                }
                className="text-xs text-red-600 hover:underline"
              >
                Remove all
              </button>
            )}
            <button type="button" onClick={() => setPickingFor(null)} className="text-xs font-medium text-slate-600 hover:underline">
              Done
            </button>
          </div>
        </div>

        {!forLogo && chosen.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            {chosen.length === 1 ? (
              (['background', 'blocks'] as const).map((layoutMode) => (
                <button
                  key={layoutMode}
                  type="button"
                  onClick={() => setPhotoLayout((prev) => ({ ...prev, [target]: layoutMode }))}
                  className={`rounded-full border px-2.5 py-0.5 ${
                    (photoLayout[target] ?? 'background') === layoutMode
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {layoutMode === 'background' ? 'Full background' : 'Photo block with text'}
                </button>
              ))
            ) : (
              <span className="text-slate-500">{chosen.length} photos — equal blocks under the headline (up to 6).</span>
            )}
          </div>
        )}

        {!forLogo && stockPhotos && !guest && (() => {
          const found = suggestions[target];
          const query = stockQuery || found?.query || scenes[target]?.headline || '';
          return (
            <div className="mb-2 rounded-lg bg-slate-50 p-2">
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void findStockPhotos(target, query);
                }}
              >
                <input
                  value={query}
                  onChange={(event) => setStockQuery(event.target.value)}
                  placeholder="What should the photo show? e.g. dance class children"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
                />
                <button type="submit" disabled={searching} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                  {searching ? 'Finding…' : '🔍 Find photos'}
                </button>
              </form>
              {found && found.photos.length > 0 && (
                <ul className="mt-1.5 grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {found.photos.map((photo) => (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => void useStockPhoto(target, photo)}
                        disabled={importing !== null}
                        title={photo.alt || `Photo by ${photo.photographer}`}
                        className={`relative block w-full overflow-hidden rounded border-2 border-transparent hover:border-slate-300 disabled:opacity-60 ${importing === photo.id ? 'border-brand-500' : ''}`}
                      >
                        <img src={photo.thumbnailUrl} alt={photo.alt} className="aspect-square w-full object-cover" loading="lazy" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {found && found.photos.length === 0 && <p className="mt-1 text-xs text-slate-500">No photos for that — try other words.</p>}
              <p className="mt-1 text-[10px] text-slate-400">
                Free stock photos{found?.photos[0] ? ` by ${found.photos[0].source === 'pixabay' ? 'Pixabay' : 'Pexels'}` : ''}, free for commercial use. Tap one to use it in this scene.
              </p>
            </div>
          );
        })()}

        {!forLogo && <p className="mb-1 text-[11px] font-medium text-slate-500">Your library</p>}
        {grid === null ? (
          <Spinner className="h-4 w-4 text-slate-400" />
        ) : grid.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nothing in your library yet — upload {forLogo ? 'your logo' : 'a photo'} from your device.
          </p>
        ) : (
          <ul className="grid grid-cols-6 gap-1 sm:grid-cols-8">
            {grid.slice(0, 24).map((asset) => {
              const selected = forLogo ? logo === asset.url : chosen.includes(asset.url);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => choosePicked(asset.url)}
                    className={`relative block w-full overflow-hidden rounded border-2 ${
                      selected ? 'border-brand-500' : 'border-transparent hover:border-slate-300'
                    }`}
                  >
                    {!forLogo && selected && (
                      <span className="absolute left-0.5 top-0.5 rounded bg-brand-600 px-1 text-[10px] font-medium text-white">
                        {chosen.indexOf(asset.url) + 1}
                      </span>
                    )}
                    <img src={asset.thumbnailUrl ?? asset.url} alt="" className="aspect-square w-full object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const photoScenesOpen =
    storyPhotoScenes === null
      ? []
      : scenes.map((_, index) => index).filter((index) => scenes[index]!.wantsPhoto && !scenePhotos[index]?.length);
  const wantLogo = storyPhotoScenes !== null && !logo && !skipped.has('logo');
  const wantAudio = storyPhotoScenes !== null && !audio && !skipped.has('audio');
  const openQuestions = (wantLogo ? 1 : 0) + photoScenesOpen.length + (wantAudio ? 1 : 0);
  const createLabel = busy
    ? 'Building…'
    : initial
      ? `Rebuild ${scenes.length} scene reel`
      : `Create ${scenes.length || ''} scene reel`;

  const createButton = (
    <Button onClick={handleCreate} disabled={busy || scenes.length === 0}>
      {createLabel}
    </Button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Magic Design" className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      {/* Top bar: way back, title, history and the one button that matters. */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            ← Back
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900">✨ Magic Design</h2>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {initial
                ? 'Say what to change, or use the buttons on each scene. The reel is rebuilt for you.'
                : 'Describe your business, or write the scenes yourself. The reel is built for you; change anything afterwards.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-sm ${
              showTemplates ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Starting points for your industry"
          >
            🗂 Templates
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-sm ${
              showHistory ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Briefs you have built before"
          >
            🕘 History{history && history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <span className="hidden sm:block">{createButton}</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4 pb-24 sm:pb-8">
        {error && <Alert>{error}</Alert>}

        {showTemplates && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Templates by industry</h3>
              <p className="text-xs text-slate-500">Pick one close to your business; the words are rewritten for you and every line stays editable.</p>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {['All', ...MAGIC_INDUSTRIES].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setIndustry(item)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    industry === item ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MAGIC_TEMPLATES.filter((template) => industry === 'All' || template.industry === industry).map((template) => (
                <li key={template.slug} className="flex flex-col rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xl leading-none">{template.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">{template.industry} · {template.goal}</p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 flex-1 text-xs text-slate-600">{fillTemplate(template.description).replace(/^\s+is /, 'We are ')}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {(aiAvailable || guest) && (
                      <button type="button" onClick={() => useTemplate(template.slug, 'write')} disabled={writing} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                        ✨ Write my story
                      </button>
                    )}
                    <button type="button" onClick={() => useTemplate(template.slug, 'scenes')} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      Use these scenes
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showHistory && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Previous briefs</p>
            {history === null ? (
              <Spinner />
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing yet — every brief you build from is kept here, so you can come back and change it.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {history.map((entry) => (
                  <li key={entry.id} className={`flex items-center gap-2 rounded-lg border p-2 ${entry.id === briefId ? 'border-brand-400' : 'border-slate-200'}`}>
                    <button type="button" onClick={() => loadFromHistory(entry)} className="min-w-0 flex-1 text-left" title="Load this brief">
                      <span className="block truncate text-sm font-medium text-slate-900">{entry.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {new Date(entry.updatedAt).toLocaleString()} · {parseBrief(entry.brief).length} scenes
                        {Object.values(toPhotoLists(entry.scenePhotos)).flat().length > 0
                          ? ` · ${Object.values(toPhotoLists(entry.scenePhotos)).flat().length} photos`
                          : ''}
                      </span>
                    </button>
                    <button type="button" onClick={() => loadFromHistory(entry)} className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700">
                      Open
                    </button>
                    <button type="button" onClick={() => removeFromHistory(entry.id)} aria-label="Delete this brief" className="shrink-0 rounded-md px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ---- Left: the story ---------------------------------------- */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{brief.trim() ? '1 · What would you like to change?' : '1 · Your story'}</h3>
                {(aiAvailable || guest) && (
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    {(
                      (brief.trim()
                        ? [
                            ['images', '🖼 Edit images'],
                            ['write', '✍️ Edit the words'],
                            ['chat', '💬 Ask AI to change'],
                            ['describe', '↺ Start over'],
                          ]
                        : [
                            ['describe', '✨ Describe your business'],
                            ['write', '✍️ Write the scenes myself'],
                          ]) as readonly (readonly ['describe' | 'images' | 'chat' | 'write', string])[]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold shadow-sm transition ${
                          mode === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {mode === 'images' ? (
                renderImagesTab()
              ) : mode === 'chat' ? (
                <div>
                  {brief.trim() === '' ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                      Nothing to change yet —{' '}
                      <button type="button" onClick={() => setMode('describe')} className="font-medium text-brand-600 hover:underline">
                        describe your business
                      </button>{' '}
                      and the story is written first.
                    </p>
                  ) : (
                    <>
                      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
                        {description.trim() && (
                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[11px] font-semibold text-white">You</span>
                            <p className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-800">{description}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-500 text-xs text-white">✨</span>
                          <p className="rounded-2xl rounded-tl-sm bg-brand-50 px-3 py-2 text-sm text-slate-800">
                            Here is your reel in {parsedScenes.length} scenes{parsedScenes[0]?.headline ? `, opening with “${parsedScenes[0].headline}”` : ''}. Tell me what to change in your own words: a scene, the tone, the language, the offer, a picture, an effect.
                          </p>
                        </div>
                        {turns.map((turn, i) => (
                          <div key={i} className="flex gap-2">
                            {turn.role === 'user' ? (
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[11px] font-semibold text-white">You</span>
                            ) : (
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-500 text-xs text-white">✨</span>
                            )}
                            <p className={`rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-slate-800 ${turn.role === 'user' ? 'bg-white' : 'bg-brand-50'}`}>{turn.text}</p>
                          </div>
                        ))}
                        {writing && (
                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-500 text-xs text-white">✨</span>
                            <p className="rounded-2xl rounded-tl-sm bg-brand-50 px-3 py-2 text-sm text-slate-500">Rewriting…</p>
                          </div>
                        )}
                        <div ref={chatEnd} />
                      </div>
                      <form
                        className="mt-2 flex items-end gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void sendChange(chatInput);
                        }}
                      >
                        <textarea
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void sendChange(chatInput);
                            }
                          }}
                          rows={2}
                          placeholder="e.g. Make scene 2 about the Carnatic classes · Shorter and more energetic · Put the phone number bigger on the last scene · Change to Tamil"
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        />
                        <Button type="submit" disabled={writing || !chatInput.trim()} className="!py-2">
                          Send
                        </Button>
                      </form>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {CHAT_SUGGESTIONS.map((hint) => (
                          <button key={hint} type="button" onClick={() => void sendChange(hint)} disabled={writing} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                            {hint}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : mode === 'describe' ? (
                <div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={7}
                    placeholder={DESCRIBE_EXAMPLE}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <label className="text-slate-600">Language</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
                      {STORY_LANGUAGES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <label className="ml-1 text-slate-600">Scenes</label>
                    <select value={sceneCount} onChange={(e) => setSceneCount(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
                      {[3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    {description.trim() === '' && (
                      <button type="button" onClick={() => setDescription(DESCRIBE_EXAMPLE)} className="font-medium text-brand-600 hover:underline">
                        Use the example
                      </button>
                    )}
                    <Button className="ml-auto !py-1.5 !text-xs" onClick={() => void writeStory()} disabled={writing}>
                      {writing ? 'Writing the story…' : brief.trim() ? '✨ Write it again' : '✨ Write the story'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Say what you do, where you are, who it is for, what makes you good at it, and what you are offering now.
                    Your brand kit's name, phone and website are used as they are; nothing else is invented. Not sure what to write?{' '}
                    <button type="button" onClick={() => setShowTemplates(true)} className="font-medium text-brand-600 hover:underline">
                      Pick a template for your industry
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <div>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={12}
                    placeholder={EXAMPLE}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      {description.trim() && brief.trim() && (
                        <>
                          Written from your description ·{' '}
                          <button type="button" onClick={() => setMode('describe')} className="font-medium text-brand-600 hover:underline">
                            change it
                          </button>
                          {' · '}
                        </>
                      )}
                      {brand && (brand.phone || brand.website) && !/^\s*footer\s*:/im.test(brief) && (
                        <button type="button" onClick={() => setBrief((b) => `Footer: ${brandFooter(brand)}\n${b}`)} className="mr-2 font-medium text-brand-600 hover:underline">
                          + Add your contact footer
                        </button>
                      )}
                      One line per scene line. <strong>Scene 1 - Opening</strong> starts a scene, <strong>add a photo</strong> asks for a picture,{' '}
                      <strong>[bold, big, yellow]</strong> styles a line —{' '}
                      <button type="button" onClick={() => setShowInstructions((v) => !v)} className="font-medium text-brand-600 hover:underline">
                        {showInstructions ? 'hide the list' : 'see all'}
                      </button>
                      .
                    </span>
                    {brief.trim() === '' && (
                      <button type="button" onClick={() => setBrief(EXAMPLE)} className="shrink-0 font-medium text-brand-600 hover:underline">
                        Use the example
                      </button>
                    )}
                  </div>
                  {scenes.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      {scenes.length} scene{scenes.length === 1 ? '' : 's'} · {totalSeconds.toFixed(1)}s ·{' '}
                      {scenes.map((scene, i) => `${i + 1}. ${scene.headline || '…'}`).join('  ')}
                      {scenesHeld > 0 && (
                        <button type="button" onClick={() => lock('More than 3 scenes')} className="ml-2 text-brand-600 hover:underline">
                          🔒 {scenesHeld} more with a free account
                        </button>
                      )}
                    </p>
                  )}
                  {showInstructions && (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      {INSTRUCTION_GROUPS.map((group) => (
                        <Fragment key={group.title}>
                          <dt className="font-medium text-slate-900">{group.title}</dt>
                          <dd>{group.words}</dd>
                        </Fragment>
                      ))}
                      <dd className="col-span-2 pt-1 text-slate-500">
                        Combine them in one bracket: <strong>Admissions open [gap, bold, gold, pop]</strong>. Each line in the brief stays as one line in the reel.
                      </dd>
                    </dl>
                  )}
                </div>
              )}
            </section>

            {storyPhotoScenes !== null && mode !== 'describe' && scenes.length > 0 && openQuestions > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-900">Before you create — a few quick questions</h3>
                {openQuestions > 0 && (
                  <ul className="mt-2 space-y-2 text-sm text-slate-800">
                    {wantLogo && (
                      <li className="flex flex-wrap items-center gap-2">
                        <span className="flex-1">Your logo on every scene?</span>
                        <button type="button" onClick={focusLogo} className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
                          Add logo
                        </button>
                        <button type="button" onClick={() => skip('logo')} className="text-xs text-slate-600 hover:underline">
                          No logo
                        </button>
                      </li>
                    )}
                    {photoScenesOpen.length > 0 && (
                      <li className="flex flex-wrap items-center gap-2">
                        <span className="flex-1">
                          {stockPhotos
                            ? `No photo could be found for scene${photoScenesOpen.length === 1 ? '' : 's'} ${photoScenesOpen.map((i) => i + 1).join(', ')} — pick one or go without.`
                            : `Scene${photoScenesOpen.length === 1 ? '' : 's'} ${photoScenesOpen.map((i) => i + 1).join(', ')} would look better with a photo of your business.`}
                        </span>
                        {photoScenesOpen.map((index) => (
                          <button key={index} type="button" onClick={() => focusScene(index)} className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700">
                            Scene {index + 1}
                          </button>
                        ))}
                        <button type="button" onClick={() => photoScenesOpen.forEach((index) => skip(`photo-${index}`))} className="text-xs text-slate-600 hover:underline">
                          Colour backgrounds
                        </button>
                      </li>
                    )}
                    {wantAudio && (
                      <li className="flex flex-wrap items-center gap-2">
                        <span className="flex-1">Music or a voice-over? You can add it later too.</span>
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
              </section>
            )}

          </div>

          {/* ---- Right: your photos, then the look ----------------------- */}
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Your photos</h3>
                <button
                  type="button"
                  onClick={() => openUpload(typeof pickingFor === 'number' ? pickingFor : 'library', true)}
                  disabled={uploading}
                  className="ml-auto rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : '⬆ Upload'}
                </button>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {typeof pickingFor === 'number'
                  ? `Tap a photo to use it on scene ${pickingFor + 1}.`
                  : 'Everything you upload or pick is kept here. Select a scene under Edit images, then tap a photo to use it.'}
              </p>
              {library === null ? (
                <Spinner className="mt-2 h-4 w-4 text-slate-400" />
              ) : library.filter((asset) => asset.url !== logo).length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">No photos yet. Upload one from your device.</p>
              ) : (
                <ul className="mt-2 grid grid-cols-4 gap-1.5">
                  {library
                    .filter((asset) => asset.url !== logo)
                    .slice(0, 24)
                    .map((asset) => {
                      const usedOn = Object.entries(scenePhotos).filter(([, urls]) => urls.includes(asset.url)).map(([k]) => Number(k) + 1);
                      return (
                        <li key={asset.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof pickingFor !== 'number') {
                                setMode('images');
                                setError('Select a scene first: tap 🔍 More under it, then this photo.');
                                return;
                              }
                              placePhoto(pickingFor, asset.url, true);
                            }}
                            className={`relative block w-full overflow-hidden rounded-md border-2 ${usedOn.length > 0 ? 'border-brand-400' : 'border-transparent hover:border-slate-300'}`}
                            title={usedOn.length > 0 ? `On scene ${usedOn.join(', ')}` : 'Use this photo'}
                          >
                            <img src={asset.thumbnailUrl ?? asset.url} alt="" className="aspect-square w-full object-cover" />
                            {usedOn.length > 0 && (
                              <span className="absolute left-0.5 top-0.5 rounded bg-brand-600 px-1 text-[10px] font-medium text-white">{usedOn.join(',')}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>

            <section ref={logoCardRef} className={`rounded-2xl border bg-white p-3 ${pickingFor === 'logo' ? 'border-brand-400' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickingFor(pickingFor === 'logo' ? null : 'logo')}
                  className={`overflow-hidden rounded-lg border-2 ${pickingFor === 'logo' ? 'border-brand-500' : 'border-slate-200 hover:border-slate-400'}`}
                  title="Logo on every scene"
                >
                  {logo ? (
                    <img src={logo} alt="" className="h-9 w-16 bg-slate-100 object-contain" />
                  ) : (
                    <span className="flex h-9 w-16 items-center justify-center bg-slate-50 text-[10px] text-slate-500">＋ logo</span>
                  )}
                </button>
                {logo ? (
                  <select value={logoPosition || directives.logoPosition || 'top-right'} onChange={(e) => setLogoPosition(e.target.value)} className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs" title="Where the logo sits">
                    {LOGO_POSITIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-500">Logo</span>
                )}
                {logo && (
                  <button type="button" onClick={() => { setLogo(undefined); setPickingFor(null); }} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                )}
                <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} title="Main colour" className="h-7 w-9 cursor-pointer rounded border border-slate-300" />
                  <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} title="Alternate colour" className="h-7 w-9 cursor-pointer rounded border border-slate-300" />
                  Colours
                </span>
              </div>
              {pickingFor === 'logo' && renderPicker('logo')}
              <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-xs">
                {audio ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-slate-700">🎵 {audio.name}</span>
                    <button type="button" onClick={() => setAudio(undefined)} className="text-red-600 hover:underline">
                      Remove
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => audioInput.current?.click()} className="font-medium text-brand-600 hover:underline">
                    🎵 Add music or a voice-over
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Phones: the Create button rides along the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:hidden">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {createButton}
      </div>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const where = uploadTarget.current ?? (pickingFor !== null ? { target: pickingFor, replace: false } : null);
          uploadTarget.current = null;
          if (file && where) void handlePhotoFile(file, where.target, where.replace);
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
  );
}
