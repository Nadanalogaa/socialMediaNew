/**
 * Renderer for editable reel projects.
 *
 * Draws a project frame by frame on a canvas. The same function powers the
 * editor preview and the recorded video, so what is edited is exactly what is
 * exported.
 */

import { prepareAudioForRecording } from './audio.js';
import { drawParticles } from './drawParticles.js';
import {
  ASPECT_RATIOS,
  easeOutCubic,
  isCharacterAnimation,
  projectDuration,
  type ProjectLayer,
  type ProjectScene,
  type ReelProject,
} from '@socialboost/shared';

const FPS = 30;

const FONT_STACK =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Fonts a user can pick. Web-safe stacks, so nothing has to be downloaded. */
export const FONT_CHOICES = [
  { label: 'Modern sans', value: FONT_STACK },
  { label: 'Classic serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Rounded', value: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { label: 'Condensed', value: '"Arial Narrow", "Helvetica Neue", sans-serif' },
  { label: 'Monospace', value: '"SF Mono", Menlo, Consolas, monospace' },
];

export type ImageCache = Map<string, HTMLImageElement>;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load an image.'));
    image.src = src;
  });
}

export async function preloadProjectImages(project: ReelProject): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  const urls = new Set<string>();
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === 'image' && layer.content) urls.add(layer.content);
    }
  }
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        cache.set(url, await loadImage(url));
      } catch {
        /* A missing photo leaves lower layers showing rather than failing. */
      }
    }),
  );
  return cache;
}

const ENTRANCE_SECONDS = 0.6;
const TRANSITION_SECONDS = 0.45;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Applies shadow, stroke and gradient, then paints one glyph run. */
function paintText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  style: ProjectLayer['style'],
): void {
  if (style.shadow) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur;
    ctx.shadowOffsetY = style.shadow.offsetY;
  }

  if (style.stroke && style.stroke.widthPct > 0) {
    ctx.lineWidth = (style.stroke.widthPct / 100) * fontSize * 2;
    ctx.strokeStyle = style.stroke.color;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }

  if (style.gradient) {
    const gradient = ctx.createLinearGradient(x, y, x, y + fontSize);
    gradient.addColorStop(0, style.gradient[0]);
    gradient.addColorStop(1, style.gradient[1]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = style.color ?? '#ffffff';
  }

  ctx.fillText(text, x, y);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draws a text layer, animating per character when the animation calls for it.
 *
 * Characters are positioned by measuring the text before each one, which keeps
 * kerning correct rather than spacing glyphs evenly.
 */
function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: ProjectLayer,
  box: { x: number; y: number; w: number; h: number },
  elapsed: number,
  height: number,
): void {
  const style = layer.style;
  const fontSize = ((style.fontSizePct ?? 5) / 100) * height;
  const text = style.textTransform === 'uppercase' ? layer.content.toUpperCase() : layer.content;

  ctx.font = `${style.fontWeight ?? 400} ${fontSize}px ${style.fontFamily ?? FONT_STACK}`;
  ctx.textBaseline = 'top';
  if (style.letterSpacing) {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      `${style.letterSpacing}px`;
  }

  const lines = wrapText(ctx, text, box.w);
  const lineHeight = fontSize * (style.lineHeight ?? 1.25);
  const blockHeight = lines.length * lineHeight;

  let originY = box.y;
  if (style.verticalAlign === 'center') originY = box.y + (box.h - blockHeight) / 2;
  else if (style.verticalAlign === 'bottom') originY = box.y + box.h - blockHeight;

  const since = elapsed - layer.delaySeconds;

  if (!isCharacterAnimation(layer.animation)) {
    for (const [index, line] of lines.entries()) {
      const lineWidth = ctx.measureText(line).width;
      let lineX = box.x;
      if (style.align === 'center') lineX = box.x + (box.w - lineWidth) / 2;
      else if (style.align === 'right') lineX = box.x + box.w - lineWidth;
      paintText(ctx, line, lineX, originY + index * lineHeight, fontSize, style);
    }
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = 'normal';
    return;
  }

  // Per-character: each glyph gets its own slice of the entrance window.
  const totalChars = Math.max(text.length, 1);
  const perChar = ENTRANCE_SECONDS / totalChars;
  let charIndex = 0;

  for (const [lineIndex, line] of lines.entries()) {
    const lineWidth = ctx.measureText(line).width;
    let cursorX = box.x;
    if (style.align === 'center') cursorX = box.x + (box.w - lineWidth) / 2;
    else if (style.align === 'right') cursorX = box.x + box.w - lineWidth;

    const lineY = originY + lineIndex * lineHeight;

    for (const character of line) {
      const charStart = charIndex * perChar;
      const progress = easeOutCubic((since - charStart) / Math.max(perChar * 3, 0.12));
      charIndex++;

      if (progress <= 0) {
        // Typewriter stops at the first unrevealed glyph; the others animate
        // in place, so their width must still be advanced.
        if (layer.animation === 'typewriter') {
          cursorX += ctx.measureText(character).width;
          continue;
        }
      }

      ctx.save();
      const width = ctx.measureText(character).width;

      if (layer.animation === 'letter-rise') {
        ctx.globalAlpha *= Math.min(progress, 1);
        ctx.translate(0, (1 - Math.min(progress, 1)) * fontSize * 0.5);
      } else if (layer.animation === 'letter-pop') {
        const scale = 0.4 + 0.6 * Math.min(progress, 1);
        ctx.globalAlpha *= Math.min(progress, 1);
        ctx.translate(cursorX + width / 2, lineY + fontSize / 2);
        ctx.scale(scale, scale);
        ctx.translate(-(cursorX + width / 2), -(lineY + fontSize / 2));
      } else if (layer.animation === 'letter-wave') {
        ctx.globalAlpha *= Math.min(progress, 1);
        // Keeps moving after the entrance, which is the point of a wave.
        const wave = Math.sin(since * 4 + charIndex * 0.5) * fontSize * 0.06;
        ctx.translate(0, wave);
      } else if (layer.animation === 'typewriter') {
        ctx.globalAlpha *= progress > 0 ? 1 : 0;
      }

      paintText(ctx, character, cursorX, lineY, fontSize, style);
      ctx.restore();
      cursorX += width;
    }
  }

  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = 'normal';
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: ProjectLayer,
  images: ImageCache,
  elapsed: number,
  sceneDuration: number,
  width: number,
  height: number,
): void {
  if (layer.hidden) return;

  const box = {
    x: (layer.box.x / 100) * width,
    y: (layer.box.y / 100) * height,
    w: (layer.box.w / 100) * width,
    h: (layer.box.h / 100) * height,
  };
  const style = layer.style;
  const since = elapsed - layer.delaySeconds;
  const progress = easeOutCubic(since / ENTRANCE_SECONDS);

  const perCharacter = isCharacterAnimation(layer.animation);
  if (!perCharacter && layer.animation !== 'none' && layer.animation !== 'ken-burns') {
    if (progress <= 0) return;
  }

  ctx.save();
  ctx.globalAlpha = style.opacity ?? 1;

  if (style.rotation) {
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate((style.rotation * Math.PI) / 180);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
  }

  // Whole-layer entrances. Character animations handle their own motion.
  if (!perCharacter) {
    switch (layer.animation) {
      case 'fade-in':
        ctx.globalAlpha *= progress;
        break;
      case 'rise':
        ctx.globalAlpha *= progress;
        ctx.translate(0, (1 - progress) * height * 0.06);
        break;
      case 'slide-left':
        ctx.globalAlpha *= progress;
        ctx.translate((1 - progress) * -height * 0.08, 0);
        break;
      case 'slide-right':
        ctx.globalAlpha *= progress;
        ctx.translate((1 - progress) * height * 0.08, 0);
        break;
      case 'pop': {
        const scale = 0.86 + 0.14 * progress;
        ctx.globalAlpha *= progress;
        ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
        break;
      }
      default:
        break;
    }
  }

  if (layer.type === 'shape') {
    ctx.fillStyle = layer.content || style.background || '#000000';
    const radius = ((style.borderRadiusPct ?? 0) / 100) * Math.min(box.w, box.h);
    if (radius > 0) {
      drawRoundedRect(ctx, box.x, box.y, box.w, box.h, radius);
      ctx.fill();
    } else {
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
  } else if (layer.type === 'image' && layer.content) {
    const image = images.get(layer.content);
    if (image) {
      ctx.save();
      drawRoundedRect(
        ctx,
        box.x,
        box.y,
        box.w,
        box.h,
        ((style.borderRadiusPct ?? 0) / 100) * Math.min(box.w, box.h),
      );
      ctx.clip();

      const t = sceneDuration > 0 ? elapsed / sceneDuration : 0;
      const kenBurns = layer.animation === 'ken-burns' ? 1.06 + 0.06 * t : 1;
      const fit = style.fit ?? 'cover';
      const base =
        fit === 'cover'
          ? Math.max(box.w / image.width, box.h / image.height)
          : Math.min(box.w / image.width, box.h / image.height);
      const scale = base * kenBurns * (style.imageZoom ?? 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      /*
       * The focal point decides which part of a cropped image survives.
       * 0 shows the left/top edge, 100 the right/bottom, 50 the middle — which
       * is the default and is what cuts the subject out of a tall photo.
       */
      const overflowX = drawWidth - box.w;
      const overflowY = drawHeight - box.h;
      const focusX = (style.focusX ?? 50) / 100;
      const focusY = (style.focusY ?? 50) / 100;
      const drift = layer.animation === 'ken-burns' ? (t - 0.5) * box.h * 0.04 : 0;

      ctx.drawImage(
        image,
        box.x - overflowX * focusX,
        box.y - overflowY * focusY + drift,
        drawWidth,
        drawHeight,
      );

      if (style.overlay) {
        if (style.overlay.startsWith('linear-gradient')) {
          const gradient = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
          gradient.addColorStop(0, 'rgba(15,23,42,0)');
          gradient.addColorStop(0.45, 'rgba(15,23,42,0)');
          gradient.addColorStop(1, 'rgba(15,23,42,0.85)');
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = style.overlay;
        }
        ctx.fillRect(box.x, box.y, box.w, box.h);
      }
      ctx.restore();
    }
  } else if (layer.type === 'particles' && layer.particles) {
    // Elapsed time drives the effect, so the preview and the recording show
    // exactly the same frame at the same moment.
    drawParticles(ctx, layer.particles, elapsed, box, width, height);
  } else if (layer.type === 'text' && layer.content) {
    drawTextLayer(ctx, layer, box, elapsed, height);
  }

  ctx.restore();
}

/**
 * Where a layer can actually be clicked, as percentages of the canvas.
 *
 * Text is measured rather than taken from its declared box: raising the font
 * size or typing a longer line makes the text spill outside the box, and
 * hit-testing the box then selects whatever is behind — usually the
 * background photo. Text is also narrowed to the width it really occupies, so
 * clicking beside a short centred line reaches what is underneath.
 */
export function layerHitBox(
  layer: ProjectLayer,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  if (layer.type !== 'text' || !layer.content) return layer.box;

  const style = layer.style;
  const boxX = (layer.box.x / 100) * width;
  const boxY = (layer.box.y / 100) * height;
  const boxW = (layer.box.w / 100) * width;
  const boxH = (layer.box.h / 100) * height;

  const fontSize = ((style.fontSizePct ?? 5) / 100) * height;
  const text = style.textTransform === 'uppercase' ? layer.content.toUpperCase() : layer.content;

  ctx.save();
  ctx.font = `${style.fontWeight ?? 400} ${fontSize}px ${style.fontFamily ?? FONT_STACK}`;
  const lines = wrapText(ctx, text, boxW);
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
  ctx.restore();

  const lineHeight = fontSize * (style.lineHeight ?? 1.25);
  const blockHeight = lines.length * lineHeight;

  let top = boxY;
  if (style.verticalAlign === 'center') top = boxY + (boxH - blockHeight) / 2;
  else if (style.verticalAlign === 'bottom') top = boxY + boxH - blockHeight;

  let left = boxX;
  if (style.align === 'center') left = boxX + (boxW - widest) / 2;
  else if (style.align === 'right') left = boxX + boxW - widest;

  // A little slack, so thin text is not a pixel-perfect target.
  const padX = fontSize * 0.25;
  const padY = fontSize * 0.2;

  return {
    x: ((left - padX) / width) * 100,
    y: ((top - padY) / height) * 100,
    w: ((widest + padX * 2) / width) * 100,
    h: ((blockHeight + padY * 2) / height) * 100,
  };
}

export function sceneAt(
  project: ReelProject,
  elapsed: number,
): { scene: ProjectScene; sceneElapsed: number; index: number } {
  let remaining = elapsed;
  for (const [index, scene] of project.scenes.entries()) {
    if (remaining < scene.durationSeconds) return { scene, sceneElapsed: remaining, index };
    remaining -= scene.durationSeconds;
  }
  const index = project.scenes.length - 1;
  const scene = project.scenes[index]!;
  return { scene, sceneElapsed: scene.durationSeconds, index };
}

/** Draws one frame. `forceScene` lets the editor show a scene while paused. */
export function drawProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: ReelProject,
  images: ImageCache,
  elapsed: number,
  width: number,
  height: number,
  forceScene?: {
    scene: ProjectScene;
    sceneElapsed: number;
    /** A separate clock for effects, so a paused scene can still sparkle. */
    effectsElapsed?: number;
  },
): void {
  const { scene, sceneElapsed } = forceScene ?? sceneAt(project, elapsed);
  const effectsElapsed = forceScene?.effectsElapsed ?? sceneElapsed;

  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const t = easeOutCubic(sceneElapsed / TRANSITION_SECONDS);
  if (scene.transitionIn !== 'cut' && sceneElapsed < TRANSITION_SECONDS) {
    if (scene.transitionIn === 'fade') ctx.globalAlpha = t;
    else if (scene.transitionIn === 'slide-up') ctx.translate(0, (1 - t) * height);
    else if (scene.transitionIn === 'wipe') {
      ctx.beginPath();
      ctx.rect(0, 0, width * t, height);
      ctx.clip();
    }
  }

  for (const layer of scene.layers) {
    drawLayer(
      ctx,
      layer,
      images,
      layer.type === 'particles' ? effectsElapsed : sceneElapsed,
      scene.durationSeconds,
      width,
      height,
    );
  }
  ctx.restore();
}

/**
 * Draws a marquee around the selected layer.
 *
 * Editor only — never part of a recording. Without it there is no way to tell
 * what a drag is about to move, which is the main reason touches feel
 * accidental.
 */
export function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  layer: { box: { x: number; y: number; w: number; h: number } },
  width: number,
  height: number,
): void {
  const x = (layer.box.x / 100) * width;
  const y = (layer.box.y / 100) * height;
  const w = (layer.box.w / 100) * width;
  const h = (layer.box.h / 100) * height;

  ctx.save();
  // Scaled to the canvas, which is 1080 wide, so it reads at any display size.
  const unit = width / 1080;

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3 * unit;
  ctx.setLineDash([10 * unit, 8 * unit]);
  ctx.strokeRect(x, y, w, h);

  // A dark companion line keeps it visible over a light photo.
  ctx.strokeStyle = 'rgba(15,23,42,0.6)';
  ctx.lineWidth = 1.5 * unit;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, w, h);

  // Corner marks, so the box reads as a handle rather than a border.
  const corner = 18 * unit;
  ctx.fillStyle = '#ffffff';
  for (const [cx, cy] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, corner / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface RecordedProject {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

function pickMimeType(): string {
  // Audio codecs are named explicitly: some browsers record a silent track
  // when only the video codec is given.
  for (const type of [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export interface RecordOptions {
  /** Output size relative to the canonical size; 1 is full resolution. */
  scale?: number;
  /** Small text stamped in the corner of every frame. */
  watermark?: string;
}

export async function recordProject(
  project: ReelProject,
  onProgress?: (progress: number) => void,
  options: RecordOptions = {},
): Promise<RecordedProject> {
  await document.fonts.ready.catch(() => undefined);
  const images = await preloadProjectImages(project);

  const scale = options.scale ?? 1;
  const { w: fullW, h: fullH } = ASPECT_RATIOS[project.ratio];
  // Even dimensions: most encoders refuse odd ones.
  const width = Math.round((fullW * scale) / 2) * 2;
  const height = Math.round((fullH * scale) / 2) * 2;
  const duration = projectDuration(project);

  const stamp = (ctx: CanvasRenderingContext2D) => {
    if (!options.watermark) return;
    const size = Math.round(height * 0.018);
    ctx.save();
    ctx.font = `600 ${size}px ${FONT_STACK}`;
    const textWidth = ctx.measureText(options.watermark).width;
    const padX = size * 0.7;
    const x = width - textWidth - padX * 2 - size;
    const y = height - size * 3.2;
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.beginPath();
    ctx.roundRect(x, y, textWidth + padX * 2, size * 1.9, size);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.watermark, x + padX, y + size * 0.95);
    ctx.restore();
  };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface.');

  const videoStream = canvas.captureStream(FPS);

  // Audio is optional; a failure to load it must not lose the whole reel.
  let audio: Awaited<ReturnType<typeof prepareAudioForRecording>> | null = null;
  if (project.audio?.url) {
    try {
      audio = await prepareAudioForRecording(project.audio, duration);
    } catch (error) {
      console.warn('Recording without sound:', error);
    }
  }

  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audio?.tracks ?? []),
  ]);
  const mimeType = pickMimeType();
  // Reels are full-screen on a phone, so compression artefacts are obvious.
  // 16 Mbps at 1080×1920 leaves headroom for the platform's own re-encode.
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: Math.round(16_000_000 * scale * scale),
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
  });

  recorder.start();
  audio?.start();
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= duration) {
        drawProjectFrame(ctx, project, images, duration - 0.001, width, height);
        stamp(ctx);
        resolve();
        return;
      }
      drawProjectFrame(ctx, project, images, elapsed, width, height);
      stamp(ctx);
      onProgress?.(elapsed / duration);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  audio?.stop();
  stream.getTracks().forEach((track) => track.stop());
  videoStream.getTracks().forEach((track) => track.stop());
  onProgress?.(1);

  return { blob: await finished, mimeType: mimeType || 'video/webm', durationSeconds: duration };
}
