/**
 * Reel renderer.
 *
 * Scenes are drawn frame by frame onto a canvas and captured with the
 * browser's own MediaRecorder, so producing a video costs nothing and needs no
 * server. The recording is uploaded to Cloudinary, which transcodes it to the
 * MP4 that Instagram and Facebook require.
 */

import {
  ASPECT_RATIOS,
  easeOutCubic,
  layerProgress,
  resolveLayerBox,
  resolveLayerContent,
  videoDurationSeconds,
  type AnimatedLayer,
  type VideoScene,
  type VideoSpec,
} from '@socialboost/shared';

const FPS = 30;
const FONT_STACK =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Decoded once per render; reloading per frame would stall the recorder. */
type ImageCache = Map<string, HTMLImageElement>;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load an image used in this reel.'));
    image.src = src;
  });
}

async function preloadImages(spec: VideoSpec): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  const urls = new Set<string>();

  for (const scene of spec.template.scenes) {
    for (const layer of scene.layers) {
      if (layer.type !== 'image') continue;
      const url = resolveLayerContent(layer, spec.values, {
        ...spec.template,
        layers: [],
      } as never);
      if (url) urls.add(url);
    }
  }

  await Promise.all(
    [...urls].map(async (url) => {
      try {
        cache.set(url, await loadImage(url));
      } catch {
        /* A missing photo leaves the layer below showing rather than failing. */
      }
    }),
  );
  return cache;
}

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

/**
 * Applies a layer's entrance animation as a canvas transform.
 *
 * Returns the alpha to draw with; the transform is left applied on the
 * context, so the caller must have saved it first.
 */
function applyAnimation(
  ctx: CanvasRenderingContext2D,
  layer: AnimatedLayer,
  progress: number,
  box: { x: number; y: number; w: number; h: number },
  height: number,
): number {
  const animation = layer.animation ?? 'none';
  if (animation === 'none' || animation === 'ken-burns') return 1;

  const centreX = box.x + box.w / 2;
  const centreY = box.y + box.h / 2;

  switch (animation) {
    case 'fade-in':
      return progress;
    case 'rise':
      ctx.translate(0, (1 - progress) * height * 0.06);
      return progress;
    case 'slide-left':
      ctx.translate((1 - progress) * -height * 0.08, 0);
      return progress;
    case 'slide-right':
      ctx.translate((1 - progress) * height * 0.08, 0);
      return progress;
    case 'pop': {
      const scale = 0.86 + 0.14 * progress;
      ctx.translate(centreX, centreY);
      ctx.scale(scale, scale);
      ctx.translate(-centreX, -centreY);
      return progress;
    }
    default:
      return 1;
  }
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: AnimatedLayer,
  spec: VideoSpec,
  images: ImageCache,
  sceneElapsed: number,
  sceneDuration: number,
  width: number,
  height: number,
): void {
  const boxPct = resolveLayerBox(layer, spec.ratio);
  const box = {
    x: (boxPct.x / 100) * width,
    y: (boxPct.y / 100) * height,
    w: (boxPct.w / 100) * width,
    h: (boxPct.h / 100) * height,
  };
  const style = layer.style ?? {};
  const content = resolveLayerContent(layer, spec.values, {
    ...spec.template,
    layers: [],
  } as never);

  const progress = layerProgress(layer, sceneElapsed);
  if (progress <= 0 && (layer.animation ?? 'none') !== 'none') return;

  ctx.save();
  const alpha = applyAnimation(ctx, layer, progress, box, height);
  ctx.globalAlpha = alpha;

  if (layer.type === 'shape') {
    ctx.fillStyle = (layer.bind ? content : null) ?? style.background ?? '#000000';
    const radius = ((style.borderRadiusPct ?? 0) / 100) * Math.min(box.w, box.h);
    if (radius > 0) {
      drawRoundedRect(ctx, box.x, box.y, box.w, box.h, radius);
      ctx.fill();
    } else {
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
  } else if (layer.type === 'image' && content) {
    const image = images.get(content);
    if (image) {
      ctx.save();
      drawRoundedRect(ctx, box.x, box.y, box.w, box.h, 0);
      ctx.clip();

      // Ken Burns: drift and zoom slowly across the scene so a still photo
      // does not read as a frozen frame.
      const t = sceneDuration > 0 ? sceneElapsed / sceneDuration : 0;
      const zoom = layer.animation === 'ken-burns' ? 1.06 + 0.06 * t : 1;
      const scale = Math.max(box.w / image.width, box.h / image.height) * zoom;
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
  } else if (layer.type === 'text' && content) {
    const fontSize = ((style.fontSizePct ?? 4) / 100) * height;
    const text = style.textTransform === 'uppercase' ? content.toUpperCase() : content;
    ctx.font = `${style.fontWeight ?? 400} ${fontSize}px ${style.fontFamily ?? FONT_STACK}`;
    ctx.fillStyle = style.color ?? '#000000';
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, text, box.w);
    const lineHeight = fontSize * (style.lineHeight ?? 1.25);
    const blockHeight = lines.length * lineHeight;

    let cursorY = box.y;
    if (style.verticalAlign === 'center') cursorY = box.y + (box.h - blockHeight) / 2;
    else if (style.verticalAlign === 'bottom') cursorY = box.y + box.h - blockHeight;

    for (const line of lines) {
      const lineWidth = ctx.measureText(line).width;
      let lineX = box.x;
      if (style.align === 'center') lineX = box.x + (box.w - lineWidth) / 2;
      else if (style.align === 'right') lineX = box.x + box.w - lineWidth;
      ctx.fillText(line, lineX, cursorY);
      cursorY += lineHeight;
    }
  }

  ctx.restore();
}

/** Scene containing a given moment, with how long it has been on screen. */
function sceneAt(spec: VideoSpec, elapsed: number): { scene: VideoScene; sceneElapsed: number } {
  let remaining = elapsed;
  for (const scene of spec.template.scenes) {
    if (remaining < scene.durationSeconds) return { scene, sceneElapsed: remaining };
    remaining -= scene.durationSeconds;
  }
  const last = spec.template.scenes[spec.template.scenes.length - 1]!;
  return { scene: last, sceneElapsed: last.durationSeconds };
}

const TRANSITION_SECONDS = 0.45;

/** Draws one frame of the reel at the given time. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  spec: VideoSpec,
  images: ImageCache,
  elapsed: number,
  width: number,
  height: number,
): void {
  const { scene, sceneElapsed } = sceneAt(spec, elapsed);

  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Scene entrances move or fade the whole scene, not each layer.
  const transition = scene.transitionIn ?? 'cut';
  const t = easeOutCubic(sceneElapsed / TRANSITION_SECONDS);
  if (transition !== 'cut' && sceneElapsed < TRANSITION_SECONDS) {
    if (transition === 'fade') ctx.globalAlpha = t;
    else if (transition === 'slide-up') ctx.translate(0, (1 - t) * height);
    else if (transition === 'wipe') {
      ctx.beginPath();
      ctx.rect(0, 0, width * t, height);
      ctx.clip();
    }
  }

  for (const layer of scene.layers) {
    drawLayer(ctx, layer, spec, images, sceneElapsed, scene.durationSeconds, width, height);
  }
  ctx.restore();
}

export interface RenderedVideo {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

/** The best container this browser can record. Safari offers MP4 directly. */
function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/**
 * Records the reel in real time.
 *
 * MediaRecorder captures a live stream, so this takes as long as the reel
 * lasts — around nine seconds. `onProgress` reports 0..1 for the UI.
 */
export async function recordVideo(
  spec: VideoSpec,
  onProgress?: (progress: number) => void,
): Promise<RenderedVideo> {
  if (!canRecordVideo()) {
    throw new Error('This browser cannot record video. Try Chrome, Edge or Safari.');
  }

  await document.fonts.ready.catch(() => undefined);
  const images = await preloadImages(spec);

  const { w: width, h: height } = ASPECT_RATIOS[spec.ratio];
  const duration = videoDurationSeconds(spec.template);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface.');

  const stream = canvas.captureStream(FPS);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 6_000_000,
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
    function frame() {
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= duration) {
        // Hold the final frame briefly so the reel does not end mid-motion.
        drawFrame(ctx!, spec, images, duration - 0.001, width, height);
        resolve();
        return;
      }
      drawFrame(ctx!, spec, images, elapsed, width, height);
      onProgress?.(elapsed / duration);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  onProgress?.(1);

  return { blob: await finished, mimeType: mimeType || 'video/webm', durationSeconds: duration };
}

/** A still frame, used for the template thumbnail and the poster image. */
export async function renderPosterFrame(spec: VideoSpec, atSeconds = 0.8): Promise<string> {
  await document.fonts.ready.catch(() => undefined);
  const images = await preloadImages(spec);
  const { w: width, h: height } = ASPECT_RATIOS[spec.ratio];

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface.');

  drawFrame(ctx, spec, images, atSeconds, width, height);
  return canvas.toDataURL('image/png');
}
