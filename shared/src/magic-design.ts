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

/**
 * Instructions written at the end of a line, in square brackets:
 * "Join us today [bold, big, yellow]". Each one adjusts only that line.
 */
export interface LineStyle {
  weight?: number;
  /** Multiplier on the size the line would otherwise get. */
  sizeScale?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
  fontFamily?: string;
  animation?: ProjectLayer['animation'];
  /** Extra space above the line, to set it apart from what came before. */
  gapBefore?: boolean;
  /** Where the line belongs, when the author overrides the guess. */
  role?: 'headline' | 'body' | 'contact';
}

export interface BriefLine {
  text: string;
  style: LineStyle;
}

export type LogoPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Lines that shape every scene rather than one: "Logo: top right",
 * "QR: https://…", "Footer: www.nadanaloga.com". Written above the first
 * scene they apply throughout; QR and Footer inside a scene apply there only.
 */
export interface BriefDirectives {
  logoPosition?: LogoPosition;
  qr?: string;
  footer: string[];
}

export interface ParsedScene {
  /** From a heading like "Scene 1 - Opening Scene". */
  label?: string;
  /** A QR code for this scene alone. */
  qr?: string;
  /** Small lines along the bottom of this scene alone. */
  footer: string[];
  /** The line that carries the message. */
  headline: string;
  /** Supporting lines, shown smaller beneath it. */
  body: string[];
  /** Contact details, set apart and smallest. */
  contact: string[];
  /** The brief asked for a picture in this scene. */
  wantsPhoto: boolean;
  /** The same lines with their instructions, for the builder. */
  lines: {
    headline?: BriefLine;
    body: BriefLine[];
    contact: BriefLine[];
  };
}

/** Named colours a brief can ask for; chosen to read over a darkened photo. */
export const BRIEF_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#111111',
  red: '#ef4444',
  yellow: '#fde047',
  gold: '#f5c542',
  orange: '#f97316',
  green: '#22c55e',
  lime: '#a3e635',
  teal: '#2dd4bf',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  purple: '#a78bfa',
  pink: '#f472b6',
  cream: '#fef3c7',
  grey: '#cbd5e1',
  gray: '#cbd5e1',
};

/** Font families a brief can ask for, matching the editor's choices. */
export const BRIEF_FONTS: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  classic: 'Georgia, "Times New Roman", serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
  condensed: '"Arial Narrow", "Helvetica Neue", sans-serif',
  narrow: '"Arial Narrow", "Helvetica Neue", sans-serif',
  mono: '"SF Mono", Menlo, Consolas, monospace',
};

const BRIEF_ANIMATIONS: Record<string, ProjectLayer['animation']> = {
  fade: 'fade-in',
  rise: 'rise',
  pop: 'pop',
  typewriter: 'typewriter',
  type: 'typewriter',
  letters: 'letter-rise',
  wave: 'letter-wave',
  slide: 'slide-left',
  still: 'none',
};

const INSTRUCTIONS = /\s*\[([^\[\]]+)\]\s*$/;

/**
 * Reads "[bold, big, yellow]" off the end of a line.
 *
 * Only brackets that contain at least one known word are instructions; a
 * line that happens to end in brackets, like "(Sat) [10am]", is left alone.
 */
export function readLineInstructions(line: string): BriefLine {
  const match = INSTRUCTIONS.exec(line);
  if (!match) return { text: line.trim(), style: {} };

  const style: LineStyle = {};
  let recognised = false;
  const words = match[1]!
    .toLowerCase()
    .split(/[,\s]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  for (const word of words) {
    let known = true;
    if (word === 'bold' || word === 'strong') style.weight = 800;
    else if (word === 'light' || word === 'thin' || word === 'normal') style.weight = 400;
    else if (word === 'huge' || word === 'biggest') style.sizeScale = 1.6;
    else if (word === 'big' || word === 'bigger' || word === 'large') style.sizeScale = 1.3;
    else if (word === 'small' || word === 'smaller') style.sizeScale = 0.8;
    else if (word === 'tiny') style.sizeScale = 0.65;
    else if (word === 'caps' || word === 'uppercase' || word === 'capital') style.uppercase = true;
    else if (word === 'left') style.align = 'left';
    else if (word === 'right') style.align = 'right';
    else if (word === 'center' || word === 'centre' || word === 'middle') style.align = 'center';
    else if (word === 'gap' || word === 'space' || word === 'break') style.gapBefore = true;
    else if (word === 'title' || word === 'headline' || word === 'heading') style.role = 'headline';
    else if (word === 'body' || word === 'text' || word === 'plain') style.role = 'body';
    else if (word === 'contact' || word === 'footer') style.role = 'contact';
    else if (BRIEF_COLORS[word]) style.color = BRIEF_COLORS[word];
    else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(word)) style.color = word;
    else if (BRIEF_FONTS[word]) style.fontFamily = BRIEF_FONTS[word];
    else if (BRIEF_ANIMATIONS[word] !== undefined) style.animation = BRIEF_ANIMATIONS[word];
    else known = false;
    recognised ||= known;
  }

  if (!recognised) return { text: line.trim(), style: {} };
  return { text: line.slice(0, match.index).trim(), style };
}

function hasInstructions(style: LineStyle): boolean {
  return Object.keys(style).length > 0;
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

const DIRECTIVE = /^\s*(logo|qr\s*code|qr|footer|every\s+scene|all\s+scenes)\s*[:\-–]\s*(.*)$/i;

type Directive =
  | { kind: 'logo'; position?: LogoPosition }
  | { kind: 'qr'; text: string }
  | { kind: 'footer'; text: string };

function readDirective(line: string): Directive | null {
  const match = DIRECTIVE.exec(line);
  if (!match) return null;
  const name = match[1]!.toLowerCase().replace(/\s+/g, ' ');
  const rest = readLineInstructions(match[2]!.trim()).text;

  if (name === 'logo') return { kind: 'logo', position: readLogoPosition(rest) };
  if (name.startsWith('qr')) return rest ? { kind: 'qr', text: rest } : null;
  return rest ? { kind: 'footer', text: rest } : null;
}

function readLogoPosition(text: string): LogoPosition | undefined {
  const words = text.toLowerCase();
  const vertical = /bottom|below|foot/.test(words) ? 'bottom' : /top|above|head/.test(words) ? 'top' : undefined;
  const horizontal = /left/.test(words) ? 'left' : /right/.test(words) ? 'right' : /cent|middle/.test(words) ? 'center' : undefined;
  if (!vertical && !horizontal) return undefined;
  return `${vertical ?? 'top'}-${horizontal ?? 'right'}` as LogoPosition;
}

/** Reads the lines that apply to the whole reel. */
export function parseBriefDirectives(brief: string): BriefDirectives {
  const directives: BriefDirectives = { footer: [] };
  const lines = brief.split('\n');
  const firstHeading = lines.findIndex((line) => SCENE_MARKER.test(line));

  lines.forEach((line, index) => {
    const directive = readDirective(line);
    if (!directive) return;
    // A logo is the same on every scene wherever it is written; QR and
    // footer lines are global only when they sit above the first scene.
    const global = directive.kind === 'logo' || firstHeading === -1 || index < firstHeading;
    if (!global) return;
    if (directive.kind === 'logo') directives.logoPosition = directive.position ?? directives.logoPosition;
    else if (directive.kind === 'qr') directives.qr = directive.text;
    else directives.footer.push(directive.text);
  });

  return directives;
}

function isContactLine(line: string): boolean {
  return CONTACT_LINE.test(line) || BARE_PHONE.test(line) || BARE_URL.test(line) || BARE_EMAIL.test(line);
}

/** Splits a brief into scenes, however it was written. */
export function parseBrief(brief: string): ParsedScene[] {
  const lines = brief.split('\n');
  const blocks: { lines: string[]; label?: string }[] = [];
  let current: string[] | null = null;
  const firstHeading = lines.findIndex((line) => SCENE_MARKER.test(line));

  for (const [index, line] of lines.entries()) {
    const directive = readDirective(line);
    if (
      directive &&
      (directive.kind === 'logo' || firstHeading === -1 || index < firstHeading)
    ) {
      continue;
    }
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
  const body: BriefLine[] = [];
  const contact: BriefLine[] = [];
  let headline: BriefLine | undefined;
  let wantsPhoto = false;
  let qr: string | undefined;
  const footer: string[] = [];

  for (const raw of block) {
    if (PHOTO_REQUEST.test(raw)) {
      wantsPhoto = true;
      continue;
    }
    const directive = readDirective(raw);
    if (directive?.kind === 'qr') {
      qr = directive.text;
      continue;
    }
    if (directive?.kind === 'footer') {
      footer.push(directive.text);
      continue;
    }
    const line = readLineInstructions(raw);
    if (!line.text) continue;

    // The author's word on where a line belongs beats the guess.
    const role =
      line.style.role ??
      (isContactLine(line.text) ? 'contact' : !headline ? 'headline' : 'body');

    if (role === 'contact') contact.push(line);
    else if (role === 'headline' && !headline) headline = line;
    else body.push(line);
  }

  // A scene of nothing but contact details still needs something to lead with.
  if (!headline && contact.length > 0) headline = contact.shift()!;

  return {
    label,
    qr,
    footer,
    headline: headline?.text ?? '',
    body: body.map((line) => line.text),
    contact: contact.map((line) => line.text),
    wantsPhoto,
    lines: { headline, body, contact },
  };
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

export type ScenePhotoLayout = 'background' | 'blocks';

export interface MagicDesignOptions {
  /**
   * Photos chosen for a specific scene, by index. One can be the backdrop;
   * several are laid out as equal tiles between the headline and the text.
   */
  scenePhotos?: (string[] | undefined)[];
  /** Backdrop or tiles, per scene. Several photos are always tiles. */
  photoLayout?: (ScenePhotoLayout | undefined)[];
  /** Photos to draw on when a scene asked for one but none was chosen. */
  photos: string[];
  /** Shown on every scene. */
  logo?: string;
  logoPosition?: LogoPosition;
  /** QR images already rendered, keyed by the text they encode. */
  qrImages?: Record<string, string>;
  directives?: BriefDirectives;
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
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
  fontFamily?: string;
  /** Space above this block, in place of the standard gap. */
  gapBefore?: number;
}

/**
 * Lines of one role, grouped so that neighbours with the same instructions
 * share a block and a line with its own instructions stands alone.
 */
function groupLines(lines: BriefLine[]): BriefLine[][] {
  const groups: BriefLine[][] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    const canJoin = last && !hasInstructions(line.style) && !hasInstructions(last[0]!.style);
    if (canJoin) last.push(line);
    else groups.push([line]);
  }
  return groups;
}

/** The base look of a role, which line instructions then adjust. */
interface RoleSpec {
  fontSizePct: number;
  minFontSizePct: number;
  maxLines: number;
  keepLines?: boolean;
  weight: number;
  lineHeight: number;
  color: string;
  animation: ProjectLayer['animation'];
  delaySeconds: number;
}

function blockFor(name: string, lines: BriefLine[], base: RoleSpec, gapBefore?: number): TextBlock {
  const style = lines[0]!.style;
  const scale = style.sizeScale ?? 1;
  const block = fitBlock({
    name,
    text: lines.map((line) => line.text).join('\n'),
    fontSizePct: base.fontSizePct * scale,
    minFontSizePct: base.minFontSizePct * scale,
    maxLines: base.maxLines,
    keepLines: base.keepLines,
    weight: style.weight ?? base.weight,
    // Known before fitting: capitals are wider, and the fit must see that.
    uppercase: style.uppercase,
    lineHeight: base.lineHeight,
    color: style.color ?? base.color,
    animation: style.animation ?? base.animation,
    delaySeconds: base.delaySeconds,
  });
  block.align = style.align;
  block.fontFamily = style.fontFamily;
  block.gapBefore = style.gapBefore ? Math.max(gapBefore ?? 0, 5) : gapBefore;
  return block;
}

/**
 * Estimates how many lines a text needs at a font size.
 *
 * There is no canvas here to measure with, so this uses an average glyph
 * width for a bold sans. It errs slightly wide, which produces a little
 * breathing room rather than a collision.
 */
/** Average glyph width for the font size; capitals run about a sixth wider. */
function glyphWidthFor(fontSizePct: number, weight: number, uppercase?: boolean): number {
  const fontPx = (fontSizePct / 100) * CANVAS_H;
  return fontPx * (weight >= 700 ? 0.6 : 0.54) * (uppercase ? 1.17 : 1);
}

const BOX_WIDTH = CANVAS_W * (1 - (TEXT_MARGIN_PCT * 2) / 100);

/** The widest single word: it cannot wrap, so it must fit on its own. */
function longestWordWidth(text: string, fontSizePct: number, weight: number, uppercase?: boolean): number {
  const longest = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  return longest * glyphWidthFor(fontSizePct, weight, uppercase);
}

function estimateLines(text: string, fontSizePct: number, weight: number, uppercase?: boolean): number {
  const glyphWidth = glyphWidthFor(fontSizePct, weight, uppercase);
  const boxWidth = BOX_WIDTH;

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
  let lines = estimateLines(spec.text, fontSizePct, spec.weight, spec.uppercase);
  const tooWide = () => longestWordWidth(spec.text, fontSizePct, spec.weight, spec.uppercase) > BOX_WIDTH;

  while ((lines > budget || tooWide()) && fontSizePct > spec.minFontSizePct) {
    fontSizePct = Math.max(spec.minFontSizePct, fontSizePct - 0.2);
    lines = estimateLines(spec.text, fontSizePct, spec.weight, spec.uppercase);
  }
  // A word wider than the frame is cut off, whatever the minimum says: one
  // long word in capitals ("TECHNOLOGY") keeps shrinking until it fits.
  while (tooWide() && fontSizePct > 1.5) {
    fontSizePct -= 0.2;
    lines = estimateLines(spec.text, fontSizePct, spec.weight, spec.uppercase);
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
      buildScene(scene, index, options, photos, brandColor, accentColor),
    ),
  };
}

/** Tile geometry for a row of equal photos, as percentages of the canvas. */
function tileGrid(count: number): { cols: number; rows: number; tileH: number } {
  if (count <= 1) return { cols: 1, rows: 1, tileH: 30 };
  if (count === 2) return { cols: 2, rows: 1, tileH: 26 };
  if (count === 3) return { cols: 3, rows: 1, tileH: 20 };
  if (count === 4) return { cols: 2, rows: 2, tileH: 20 };
  return { cols: 3, rows: 2, tileH: 16 };
}

const TILE_GAP_W = 2;
const TILE_GAP_H = 1.2;
const MAX_TILES = 6;

interface PhotoBlock {
  kind: 'photos';
  urls: string[];
  heightPct: number;
  gapBefore?: number;
}

type FlowBlock = (TextBlock & { kind: 'text' }) | PhotoBlock;

function photoBlock(urls: string[]): PhotoBlock {
  const shown = urls.slice(0, MAX_TILES);
  const { rows, tileH } = tileGrid(shown.length);
  return { kind: 'photos', urls: shown, heightPct: rows * tileH + (rows - 1) * TILE_GAP_H };
}

function buildScene(
  scene: ParsedScene,
  index: number,
  options: MagicDesignOptions,
  photos: string[],
  brandColor: string,
  accentColor: string,
): ProjectScene {
  const layers: ProjectLayer[] = [];
  const chosen = (options.scenePhotos?.[index] ?? []).filter(Boolean);
  const layout: ScenePhotoLayout =
    chosen.length > 1 ? 'blocks' : (options.photoLayout?.[index] ?? 'background');

  // A scene shows a photo only when the author chose one for it, or wrote
  // "add a photo" and left the choice to the library. A scene with neither
  // gets a plain colour: nothing the author did not ask for.
  const fallback = photos.length > 0 ? photos[index % photos.length] : undefined;
  const backdrop =
    layout === 'background' ? (chosen[0] ?? (scene.wantsPhoto ? fallback : undefined)) : undefined;
  const tiles = layout === 'blocks' ? chosen : [];
  const usePhoto = Boolean(backdrop);
  const photo = backdrop;

  const directives = options.directives ?? { footer: [] };
  const qrText = scene.qr ?? directives.qr;
  const qrImage = qrText ? options.qrImages?.[qrText] : undefined;
  const footer = scene.footer.length > 0 ? scene.footer : directives.footer;
  const logoPosition = options.logoPosition ?? directives.logoPosition ?? 'top-right';
  const logoAtBottom = Boolean(options.logo) && logoPosition.startsWith('bottom');

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
  const blocks: FlowBlock[] = [];
  const { lines } = scene;
  const text = (block: TextBlock): FlowBlock => ({ ...block, kind: 'text' });

  if (lines.headline) {
    const headline = lines.headline.text;
    blocks.push(
      text(blockFor(headline.slice(0, 24), [lines.headline], {
        fontSizePct: headline.length > 42 ? 6.4 : headline.length > 24 ? 7.6 : 9,
        minFontSizePct: 4.6,
        maxLines: 2,
        weight: 800,
        lineHeight: 1.15,
        color: '#ffffff',
        animation: 'letter-rise',
        delaySeconds: 0.15,
      })),
    );
  }

  // Tiles sit under the headline and above the supporting text.
  if (tiles.length > 0) blocks.push(photoBlock(tiles));

  const BODY: RoleSpec = {
    fontSizePct: 4,
    minFontSizePct: 2.4,
    maxLines: 6,
    keepLines: true,
    weight: 500,
    lineHeight: 1.45,
    color: '#e2e8f0',
    animation: 'fade-in',
    delaySeconds: 0.6,
  };
  const CONTACT: RoleSpec = {
    fontSizePct: 3.4,
    minFontSizePct: 2.4,
    maxLines: 4,
    keepLines: true,
    weight: 700,
    lineHeight: 1.4,
    color: '#ffffff',
    animation: 'rise',
    delaySeconds: 0.95,
  };

  // Lines within a role sit close together; roles are set further apart.
  const INNER_GAP = 1.2;
  groupLines(lines.body).forEach((group, i) => {
    blocks.push(text(blockFor('Details', group, BODY, i === 0 ? undefined : INNER_GAP)));
  });
  groupLines(lines.contact).forEach((group, i) => {
    blocks.push(text(blockFor('Contact', group, CONTACT, i === 0 ? undefined : INNER_GAP)));
  });

  const GAP = 3;
  const SAFE_TOP = 12;
  // The band shrinks for whatever sits along the bottom edge.
  const SAFE_BOTTOM = qrImage ? 79 : footer.length > 0 || logoAtBottom ? 88 : 92;
  const available = SAFE_BOTTOM - SAFE_TOP;

  let gapScale = 1;
  const gapAbove = (block: FlowBlock, i: number) =>
    i === 0 ? 0 : (block.gapBefore ?? GAP) * gapScale;
  let totalHeight = blocks.reduce((sum, block, i) => sum + block.heightPct + gapAbove(block, i), 0);

  // An extreme brief can outgrow the safe band even at minimum sizes; scale
  // the whole stack down rather than let the last block sit under the
  // platform's own buttons.
  if (totalHeight > available) {
    const scale = available / totalHeight;
    for (const block of blocks) {
      if (block.kind === 'text') block.fontSizePct *= scale;
      block.heightPct *= scale;
    }
    gapScale = scale;
    totalHeight = available;
  }

  // Centred within the band where nothing else is drawn over it.
  let cursorY = SAFE_TOP + (available - totalHeight) / 2;

  blocks.forEach((block, i) => {
    cursorY += gapAbove(block, i);
    if (block.kind === 'photos') {
      const { cols, rows, tileH: naturalH } = tileGrid(block.urls.length);
      const tileH = (block.heightPct - (rows - 1) * TILE_GAP_H) / rows;
      const tileW = (100 - TEXT_MARGIN_PCT * 2 - TILE_GAP_W * (cols - 1)) / cols;
      block.urls.forEach((url, n) => {
        const col = n % cols;
        const row = Math.floor(n / cols);
        layers.push({
          id: newId('layer'),
          type: 'image',
          name: `Photo ${n + 1}`,
          content: url,
          box: {
            x: TEXT_MARGIN_PCT + col * (tileW + TILE_GAP_W),
            y: cursorY + row * (tileH + TILE_GAP_H),
            w: tileW,
            h: tileH,
          },
          style: { fit: 'cover', focusX: 50, focusY: 50, borderRadiusPct: 10 },
          animation: 'pop',
          delaySeconds: 0.3 + n * 0.1,
        });
      });
      void naturalH;
      cursorY += block.heightPct;
      return;
    }
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
        align: block.align ?? 'center',
        lineHeight: block.lineHeight,
        shadow: { color: 'rgba(0,0,0,0.45)', blur: 22, offsetY: 2 },
        ...(block.uppercase ? { textTransform: 'uppercase' as const } : {}),
        ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}),
      },
      animation: block.animation,
      delaySeconds: block.delaySeconds,
    });
    cursorY += block.heightPct;
  });

  if (options.logo) {
    const LOGO_W = 22;
    const LOGO_H = 8;
    const [vertical, horizontal] = logoPosition.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
    layers.push({
      id: newId('layer'),
      type: 'image',
      name: 'Logo',
      content: options.logo,
      box: {
        x: horizontal === 'left' ? 4 : horizontal === 'right' ? 100 - 4 - LOGO_W : 50 - LOGO_W / 2,
        y: vertical === 'top' ? 3 : 97 - LOGO_H,
        w: LOGO_W,
        h: LOGO_H,
      },
      style: { fit: 'contain', focusX: 50, focusY: 50 },
      animation: 'fade-in',
      delaySeconds: 0,
    });
  }

  if (qrImage) {
    // Square on the canvas: 16% of the width is 9% of a 9:16 height.
    layers.push({
      id: newId('layer'),
      type: 'image',
      name: 'QR code',
      content: qrImage,
      box: { x: 100 - TEXT_MARGIN_PCT - 16, y: 82, w: 16, h: 9 },
      style: { fit: 'contain', focusX: 50, focusY: 50, borderRadiusPct: 8 },
      animation: 'pop',
      delaySeconds: 1.1,
    });
    if (footer.length === 0 && qrText) {
      layers.push({
        id: newId('layer'),
        type: 'text',
        name: 'Scan',
        content: 'Scan to open',
        box: { x: 100 - TEXT_MARGIN_PCT - 16, y: 91.5, w: 16, h: 3 },
        style: { fontSizePct: 1.6, fontWeight: 600, color: '#e2e8f0', align: 'center' },
        animation: 'fade-in',
        delaySeconds: 1.3,
      });
    }
  }

  if (footer.length > 0) {
    // Set to the left of the QR when both are present, otherwise centred.
    const width = qrImage ? 100 - TEXT_MARGIN_PCT * 2 - 18 : 100 - TEXT_MARGIN_PCT * 2;
    layers.push({
      id: newId('layer'),
      type: 'text',
      name: 'Footer',
      content: footer.join('\n'),
      box: { x: TEXT_MARGIN_PCT, y: 100 - 3 - 2.6 * footer.length, w: width, h: 2.6 * footer.length + 0.5 },
      style: {
        fontSizePct: 1.9,
        fontWeight: 600,
        color: '#e2e8f0',
        align: qrImage ? 'left' : 'center',
        lineHeight: 1.35,
        shadow: { color: 'rgba(0,0,0,0.45)', blur: 16, offsetY: 2 },
      },
      animation: 'fade-in',
      delaySeconds: 1.0,
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

// --- Story plans ------------------------------------------------------------

/**
 * One scene of a story written for the user, from a plain description of
 * their business. The AI produces this shape; `briefFromPlan` turns it into
 * the same brief text a person would have written, so everything downstream
 * — parsing, editing, history — is unchanged.
 */
export interface StoryScene {
  label?: string;
  headline: string;
  /** Instruction words for the headline, e.g. ["bold", "yellow", "pop"]. */
  headlineStyle?: string[];
  body: string[];
  contact: string[];
  /** The scene is better with a picture; the user is asked for one. */
  photo: boolean;
  /** What that picture should show, as a short stock-photo search. */
  imageQuery?: string;
}

export interface MagicStoryPlan {
  title: string;
  /** The language the lines are written in, as the user asked. */
  language: string;
  /** Small line along the bottom of every scene: usually website · phone. */
  footer?: string;
  scenes: StoryScene[];
}

/** Instruction words the serialiser lets through; anything else is dropped. */
const PLAN_STYLE_WORDS = new Set([
  'bold', 'light', 'huge', 'big', 'small', 'caps', 'left', 'right', 'centre', 'gap',
  'fade', 'rise', 'pop', 'typewriter', 'letters', 'wave', 'slide', 'still',
  ...Object.keys(BRIEF_COLORS),
  ...Object.keys(BRIEF_FONTS),
]);

/** A line of plan text, safe to drop into a brief: one line, no brackets. */
function planLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/[\[\]]/g, '').trim();
}

/** Writes a plan as brief text, exactly as the parser expects it. */
export function briefFromPlan(plan: MagicStoryPlan): string {
  const out: string[] = [];
  const footer = plan.footer ? planLine(plan.footer) : '';
  if (footer) out.push(`Footer: ${footer}`, '');

  plan.scenes.forEach((scene, index) => {
    const label = scene.label ? planLine(scene.label) : '';
    out.push(`Scene ${index + 1}${label ? ` - ${label}` : ''}`);
    const headline = planLine(scene.headline);
    if (headline) {
      const words = (scene.headlineStyle ?? [])
        .map((word) => word.toLowerCase().trim())
        .filter((word) => PLAN_STYLE_WORDS.has(word));
      out.push(words.length > 0 ? `${headline} [${words.join(', ')}]` : headline);
    }
    for (const line of scene.body) {
      const text = planLine(line);
      if (text) out.push(text);
    }
    if (scene.photo) out.push('And add a photo');
    for (const line of scene.contact) {
      const text = planLine(line);
      if (!text) continue;
      // Already set apart by the parser? Leave it; otherwise mark it.
      out.push(isContactLine(text) ? text : `Contact: ${text}`);
    }
    out.push('');
  });

  return out.join('\n').trim() + '\n';
}
