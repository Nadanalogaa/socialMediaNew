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

/**
 * A line that is only a phone number, a web address or an email is contact
 * detail even without a "Contact:" label. "75679 19201" and
 * "www.nadanaloga.com" belong with the phone number, not in the body.
 */
const BARE_PHONE = /^\s*(\+?\d[\d\s\-().]{6,}\d)\s*$/;
const BARE_URL = /^\s*(https?:\/\/\S+|www\.\S+|[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|in|org|net|co|io|app|edu)(\/\S*)?)\s*$/i;
const BARE_EMAIL = /^\s*[^\s@]+@[^\s@]+\.[a-z]{2,}\s*$/i;

function isContactLine(line: string): boolean {
  return CONTACT_LINE.test(line) || BARE_PHONE.test(line) || BARE_URL.test(line) || BARE_EMAIL.test(line);
}

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
    if (isContactLine(line)) {
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

const CANVAS_W = 1080;
const CANVAS_H = 1920;
/** Horizontal margin each side, as a percentage of width. */
const TEXT_MARGIN_PCT = 6;

interface TextBlock {
  name: string;
  text: string;
  fontSizePct: number;
  weight: number;
  lineHeight: number;
  color: string;
  animation: ProjectLayer['animation'];
  delaySeconds: number;
  heightPct: number;
}

/**
 * Estimates how many lines a text needs at a font size.
 *
 * There is no canvas here to measure with, so this uses an average glyph
 * width for a bold sans. It errs slightly wide, which produces a little
 * breathing room rather than a collision.
 */
function estimateLines(text: string, fontSizePct: number, weight: number): number {
  const fontPx = (fontSizePct / 100) * CANVAS_H;
  const glyphWidth = fontPx * (weight >= 700 ? 0.6 : 0.54);
  const boxWidth = CANVAS_W * (1 - (TEXT_MARGIN_PCT * 2) / 100);

  return text.split('\n').reduce((lines, paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return lines + 1;
    // Greedy wrap on word widths, as the renderer does.
    let count = 1;
    let width = 0;
    for (const word of words) {
      const wordWidth = (word.length + 1) * glyphWidth;
      if (width + wordWidth > boxWidth && width > 0) {
        count++;
        width = wordWidth;
      } else {
        width += wordWidth;
      }
    }
    return lines + count;
  }, 0);
}

/**
 * Shrinks a block's type until it fits its line budget, then sizes it.
 *
 * With `keepLines`, the budget is the number of lines the author wrote: a
 * line in the brief is a line on screen. "Join Nadanaloga Fine Arts Academy"
 * typed as one line must not come out as two, so the type gets smaller
 * before it is allowed to wrap. Only below the minimum size does wrapping
 * become the lesser evil.
 */
function fitBlock(
  spec: Omit<TextBlock, 'heightPct'> & {
    minFontSizePct: number;
    maxLines: number;
    keepLines?: boolean;
  },
): TextBlock {
  const authored = spec.text.split('\n').length;
  const budget = spec.keepLines ? authored : spec.maxLines;

  let fontSizePct = spec.fontSizePct;
  let lines = estimateLines(spec.text, fontSizePct, spec.weight);

  while (lines > budget && fontSizePct > spec.minFontSizePct) {
    fontSizePct = Math.max(spec.minFontSizePct, fontSizePct - 0.2);
    lines = estimateLines(spec.text, fontSizePct, spec.weight);
  }

  const { minFontSizePct: _min, maxLines: _max, keepLines: _keep, ...rest } = spec;
  return { ...rest, fontSizePct, heightPct: lines * fontSizePct * spec.lineHeight + 0.5 };
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

  /*
   * Text is laid out as a flow, not at fixed positions.
   *
   * Fixed boxes overlapped the moment a headline wrapped to three lines or a
   * body had more than two. Each block's height is estimated from its text,
   * the blocks are stacked with gaps, and the whole group is centred — so a
   * wordy scene lengthens its stack and a short one sits in the middle.
   */
  const blocks: TextBlock[] = [];

  if (scene.headline) {
    blocks.push(
      fitBlock({
        name: scene.headline.slice(0, 24),
        text: scene.headline,
        fontSizePct: scene.headline.length > 42 ? 6.4 : scene.headline.length > 24 ? 7.6 : 9,
        minFontSizePct: 4.6,
        maxLines: 2,
        weight: 800,
        lineHeight: 1.15,
        color: '#ffffff',
        animation: 'letter-rise',
        delaySeconds: 0.15,
      }),
    );
  }

  if (scene.body.length > 0) {
    blocks.push(
      fitBlock({
        name: 'Details',
        text: scene.body.join('\n'),
        fontSizePct: 4,
        minFontSizePct: 2.4,
        maxLines: 6,
        keepLines: true,
        weight: 500,
        lineHeight: 1.45,
        color: '#e2e8f0',
        animation: 'fade-in',
        delaySeconds: 0.6,
      }),
    );
  }

  if (scene.contact.length > 0) {
    blocks.push(
      fitBlock({
        name: 'Contact',
        text: scene.contact.join('\n'),
        fontSizePct: 3.4,
        minFontSizePct: 2.4,
        maxLines: 4,
        keepLines: true,
        weight: 700,
        lineHeight: 1.4,
        color: '#ffffff',
        animation: 'rise',
        delaySeconds: 0.95,
      }),
    );
  }

  const GAP = 3;
  const SAFE_TOP = 12;
  const SAFE_BOTTOM = 92;
  const available = SAFE_BOTTOM - SAFE_TOP;

  let totalHeight =
    blocks.reduce((sum, block) => sum + block.heightPct, 0) + GAP * Math.max(0, blocks.length - 1);

  // An extreme brief can outgrow the safe band even at minimum sizes; scale
  // the whole stack down rather than let the last block sit under the
  // platform's own buttons.
  if (totalHeight > available) {
    const scale = available / totalHeight;
    for (const block of blocks) {
      block.fontSizePct *= scale;
      block.heightPct *= scale;
    }
    totalHeight = available;
  }

  // Centred within the band where nothing else is drawn over it.
  let cursorY = SAFE_TOP + (available - totalHeight) / 2;

  for (const block of blocks) {
    layers.push({
      id: newId('layer'),
      type: 'text',
      name: block.name,
      content: block.text,
      box: { x: TEXT_MARGIN_PCT, y: cursorY, w: 100 - TEXT_MARGIN_PCT * 2, h: block.heightPct },
      style: {
        fontSizePct: block.fontSizePct,
        fontWeight: block.weight,
        color: block.color,
        align: 'center',
        lineHeight: block.lineHeight,
        shadow: { color: 'rgba(0,0,0,0.45)', blur: 22, offsetY: 2 },
      },
      animation: block.animation,
      delaySeconds: block.delaySeconds,
    });
    cursorY += block.heightPct + GAP;
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
