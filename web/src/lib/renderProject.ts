/**
 * Renderer for editable reel projects.
 *
 * Draws a project frame by frame on a canvas. The same function powers the
 * editor preview and the recorded video, so what is edited is exactly what is
 * exported.
 */

import {
  ASPECT_RATIOS,
  easeOutCubic,
  isCharacterAnimation,
  projectDuration,
  type ProjectLayer,
  type ProjectScene,
  type ReelProject,
} from '@socialboost/shared';

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
      const zoom = layer.animation === 'ken-burns' ? 1.06 + 0.06 * t : 1;
      const fit = style.fit ?? 'cover';
      const base =
        fit === 'cover'
          ? Math.max(box.w / image.width, box.h / image.height)
          : Math.min(box.w / image.width, box.h / image.height);
      const scale = base * zoom;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const drift = layer.animation === 'ken-burns' ? (t - 0.5) * box.h * 0.04 : 0;

      ctx.drawImage(
        image,
        box.x + (box.w - drawWidth) / 2,
        box.y + (box.h - drawHeight) / 2 + drift,
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
  } else if (layer.type === 'text' && layer.content) {
    drawTextLayer(ctx, layer, box, elapsed, height);
  }

  ctx.restore();
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
  forceScene?: { scene: ProjectScene; sceneElapsed: number },
): void {
  const { scene, sceneElapsed } = forceScene ?? sceneAt(project, elapsed);

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
    drawLayer(ctx, layer, images, sceneElapsed, scene.durationSeconds, width, height);
  }
  ctx.restore();
}

export interface RecordedProject {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

function pickMimeType(): string {
  for (const type of [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export async function recordProject(
  project: ReelProject,
  onProgress?: (progress: number) => void,
): Promise<RecordedProject> {
  await document.fonts.ready.catch(() => undefined);
  const images = await preloadProjectImages(project);

  const { w: width, h: height } = ASPECT_RATIOS[project.ratio];
  const duration = projectDuration(project);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface.');

  const stream = canvas.captureStream(30);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
  });

  recorder.start();
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= duration) {
        drawProjectFrame(ctx, project, images, duration - 0.001, width, height);
        resolve();
        return;
      }
      drawProjectFrame(ctx, project, images, elapsed, width, height);
      onProgress?.(elapsed / duration);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  onProgress?.(1);

  return { blob: await finished, mimeType: mimeType || 'video/webm', durationSeconds: duration };
}
