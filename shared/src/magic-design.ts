/**
 * Magic Design.
 *
 * Turns a written brief into a finished reel. The structured form —
 * "Scene 1", then lines — is parsed directly, with no language model
 * involved, so it is instant and free. A brief without scene markers is split
 * on paragraphs, and failing that on sentences.
 */

import type { AspectRatioKey } from './domain.js';
import { newId, type ProjectLayer, type ProjectScene, type ReelProject } from './reel-project.js';

export interface ParsedScene {
  /** From a heading like "Scene 1 - Opening Scene". */
  label?: string;
  /** The line that carries the message. */
  headline: string;
  /** Supporting lines, shown smaller beneath it. */
  body: string[];
  /** Contact details, set apart and smallest. */
  contact: string[];
  /** The brief asked for a picture in this scene. */
  wantsPhoto: boolean;
}

/**
 * A scene heading, with an optional label after the number.
 *
 * "Scene 1", "Scene 2:", and "Scene 1 - Opening Scene" are all headings; the
 * label names the scene rather than becoming its first line of text. A line
 * without a number after "scene" is ordinary content.
 */
const SCENE_MARKER = /^\s*scene\s*(\d+)\s*[:.\-–—)]*\s*(.*)$/i;
const PHOTO_REQUEST = /^\s*(and\s+)?(add|use|insert|put)\s+(a|an|the|some)?\s*(photo|image|picture|pic|video)s?\b/i;
const CONTACT_LINE = /^\s*(contact|phone|call|mobile|whats?app|website|web|url|email|e-mail|mail|address|visit)\b\s*[:\-–]?/i;

/** Splits a brief into scenes, however it was written. */
export function parseBrief(brief: string): ParsedScene[] {
  const lines = brief.split('\n');
  const blocks: { lines: string[]; label?: string }[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const heading = SCENE_MARKER.exec(line);
    if (heading) {
      current = [];
      blocks.push({ lines: current, label: heading[2]?.trim() || undefined });
      continue;
    }
    if (line.trim() === '' && current && current.length > 0) {
      // A blank line separates scenes only when no markers were used.
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      blocks.push({ lines: current });
    }
    if (line.trim()) current.push(line.trim());
  }

  const populated = blocks.filter((block) => block.lines.length > 0);

  // One unbroken block of prose is a summary, not a scene: a whole paragraph
  // as a single headline is unreadable, so split it into a few scenes.
  const isSingleProseBlock =
    populated.length === 1 &&
    populated[0]!.lines.length === 1 &&
    populated[0]!.lines[0]!.split(/\s+/).length > 12;

  if (populated.length > 0 && !isSingleProseBlock) {
    return populated.map((block) => toScene(block.lines, block.label));
  }

  const source = isSingleProseBlock ? populated[0]!.lines[0]! : brief;
  const sentences = source
    .split(/(?<=[.!?•])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) return [toScene([source.trim()])];

  // Three scenes is the shape a short reel wants; fewer sentences give fewer.
  const perScene = Math.max(1, Math.ceil(sentences.length / Math.min(3, sentences.length)));
  return chunk(sentences, perScene).map((block) => toScene(block));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toScene(block: string[], label?: string): ParsedScene {
  const body: string[] = [];
  const contact: string[] = [];
  let wantsPhoto = false;
  let headline = '';

  for (const line of block) {
    if (PHOTO_REQUEST.test(line)) {
      wantsPhoto = true;
      continue;
    }
    if (CONTACT_LINE.test(line)) {
      contact.push(line);
      continue;
    }
    if (!headline) headline = line;
    else body.push(line);
  }

  // A scene of nothing but contact details still needs something to lead with.
  if (!headline && contact.length > 0) headline = contact.shift()!;

  return { label, headline, body, contact, wantsPhoto };
}

/**
 * How long a scene should hold.
 *
 * Long enough to read at a comfortable pace, bounded so one wordy scene
 * cannot stall the reel.
 */
export function sceneDurationFor(scene: ParsedScene): number {
  const words = [scene.headline, ...scene.body, ...scene.contact]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.min(6, Math.max(2.5, 1.8 + words * 0.28));
}

export interface MagicDesignOptions {
  /**
   * A photo chosen for a specific scene, by index. Takes precedence over the
   * pool, so "this picture on scene 2" is honoured exactly.
   */
  scenePhotos?: (string | undefined)[];
  /** Photos to draw on when a scene has none of its own. */
  photos: string[];
  brandColor: string;
  accentColor: string;
  ratio?: AspectRatioKey;
  name?: string;
}

/** Builds a complete, editable reel from a parsed brief. */
export function buildProjectFromBrief(
  scenes: ParsedScene[],
  options: MagicDesignOptions,
): ReelProject {
  const { photos, brandColor, accentColor } = options;

  return {
    name: options.name?.trim() || 'Magic design',
    ratio: options.ratio ?? 'story',
    scenes: scenes.map((scene, index) =>
      buildScene(scene, index, options.scenePhotos?.[index], photos, brandColor, accentColor),
    ),
  };
}

function buildScene(
  scene: ParsedScene,
  index: number,
  chosenPhoto: string | undefined,
  photos: string[],
  brandColor: string,
  accentColor: string,
): ProjectScene {
  const layers: ProjectLayer[] = [];
  // A photo chosen for this scene always wins; otherwise one is taken from the
  // pool, alternating so a reel is not the same treatment throughout.
  const fallback = photos.length > 0 ? photos[index % photos.length] : undefined;
  const photo = chosenPhoto ?? fallback;
  const usePhoto = Boolean(photo) && (Boolean(chosenPhoto) || scene.wantsPhoto || index % 2 === 0);

  layers.push({
    id: newId('layer'),
    type: 'shape',
    name: 'Background',
    content: index % 2 === 0 ? brandColor : accentColor,
    box: { x: 0, y: 0, w: 100, h: 100 },
    style: { background: index % 2 === 0 ? brandColor : accentColor },
    animation: 'none',
    delaySeconds: 0,
  });

  if (usePhoto && photo) {
    layers.push({
      id: newId('layer'),
      type: 'image',
      name: 'Photo',
      content: photo,
      box: { x: 0, y: 0, w: 100, h: 100 },
      // Darkened, because white text over an unknown photo is a gamble.
      style: { fit: 'cover', overlay: 'rgba(15,23,42,0.55)', focusX: 50, focusY: 45 },
      animation: 'ken-burns',
      delaySeconds: 0,
    });
  }

  const hasBody = scene.body.length > 0;
  const hasContact = scene.contact.length > 0;

  // Headline sits high when there is more beneath it, centred when alone.
  const headlineY = hasBody || hasContact ? 32 : 40;
  // Long headlines need smaller type to stay on screen.
  const headlineSize = scene.headline.length > 42 ? 6.4 : scene.headline.length > 24 ? 7.6 : 9;

  if (scene.headline) {
    layers.push({
      id: newId('layer'),
      type: 'text',
      name: scene.headline.slice(0, 24),
      content: scene.headline,
      box: { x: 8, y: headlineY, w: 84, h: 22 },
      style: {
        fontSizePct: headlineSize,
        fontWeight: 800,
        color: '#ffffff',
        align: 'center',
        lineHeight: 1.15,
        shadow: { color: 'rgba(0,0,0,0.45)', blur: 24, offsetY: 2 },
      },
      animation: 'letter-rise',
      delaySeconds: 0.15,
    });
  }

  if (hasBody) {
    layers.push({
      id: newId('layer'),
      type: 'text',
      name: 'Details',
      content: scene.body.join('\n'),
      box: { x: 10, y: 57, w: 80, h: 18 },
      style: {
        fontSizePct: 4,
        fontWeight: 500,
        color: '#e2e8f0',
        align: 'center',
        lineHeight: 1.45,
        shadow: { color: 'rgba(0,0,0,0.4)', blur: 16, offsetY: 1 },
      },
      animation: 'fade-in',
      delaySeconds: 0.6,
    });
  }

  if (hasContact) {
    layers.push({
      id: newId('layer'),
      type: 'text',
      name: 'Contact',
      content: scene.contact.join('\n'),
      box: { x: 8, y: 78, w: 84, h: 14 },
      style: {
        fontSizePct: 3.4,
        fontWeight: 700,
        color: '#ffffff',
        align: 'center',
        lineHeight: 1.4,
        shadow: { color: 'rgba(0,0,0,0.5)', blur: 14, offsetY: 1 },
      },
      animation: 'rise',
      delaySeconds: 0.95,
    });
  }

  return {
    id: newId('scene'),
    name: scene.label ? `${index + 1}. ${scene.label}` : `Scene ${index + 1}`,
    durationSeconds: sceneDurationFor(scene),
    // The first scene has nothing to transition from.
    transitionIn: index === 0 ? 'cut' : index % 2 === 0 ? 'slide-up' : 'fade',
    layers,
  };
}
