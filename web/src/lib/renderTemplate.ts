/**
 * Canvas renderer for ad templates.
 *
 * Rendering happens in the browser so the preview and the exported image come
 * from exactly one code path — what the user sees is what they get, with no
 * round trip and nothing to install on the server.
 *
 * Layers are positioned in percentages, so the same definition renders every
 * output size.
 */

import {
  ASPECT_RATIOS,
  resolveLayerBox,
  resolveLayerContent,
  visibleLayers,
  type AspectRatioKey,
  type CreativeSpec,
  type TemplateLayer,
} from '@socialboost/shared';

/** Fonts must be loaded before measuring text, or the first render mis-wraps. */
async function ensureFontsReady(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    /* Older browsers without the Font Loading API still render acceptably. */
  }
}

const FONT_STACK =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Images drawn on the canvas must be CORS-clean or the canvas becomes tainted. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load that image.'));
    image.src = src;
  });
}

/** Greedy word wrap; returns the lines that fit the given width. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
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

/** `cover` fills the box and crops; `contain` fits the whole image inside it. */
function drawImageFitted(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'cover' | 'contain',
): void {
  const scale =
    fit === 'cover'
      ? Math.max(w / image.width, h / image.height)
      : Math.min(w / image.width, h / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (w - drawWidth) / 2, y + (h - drawHeight) / 2, drawWidth, drawHeight);
}

async function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: TemplateLayer,
  spec: CreativeSpec,
  width: number,
  height: number,
): Promise<void> {
  const box = resolveLayerBox(layer, spec.ratio);
  const x = (box.x / 100) * width;
  const y = (box.y / 100) * height;
  const w = (box.w / 100) * width;
  const h = (box.h / 100) * height;
  const style = layer.style ?? {};
  const content = resolveLayerContent(layer, spec.values, spec.template);

  ctx.save();
  ctx.globalAlpha = style.opacity ?? 1;

  if (layer.type === 'shape') {
    // A bound colour field overrides the template's own background.
    ctx.fillStyle = (layer.bind ? content : null) ?? style.background ?? '#000000';
    const radius = ((style.borderRadiusPct ?? 0) / 100) * Math.min(w, h);
    if (radius > 0) {
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
  } else if (layer.type === 'image' && content) {
    try {
      const image = await loadImage(content);
      ctx.save();
      drawRoundedRect(ctx, x, y, w, h, ((style.borderRadiusPct ?? 0) / 100) * Math.min(w, h));
      ctx.clip();
      drawImageFitted(ctx, image, x, y, w, h, style.fit ?? 'cover');

      // Darkens the photo so text above it stays legible.
      if (style.overlay) {
        if (style.overlay.startsWith('linear-gradient')) {
          const gradient = ctx.createLinearGradient(x, y, x, y + h);
          gradient.addColorStop(0, 'rgba(15,23,42,0)');
          gradient.addColorStop(0.45, 'rgba(15,23,42,0)');
          gradient.addColorStop(1, 'rgba(15,23,42,0.85)');
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = style.overlay;
        }
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    } catch {
      /* A missing photo leaves the layer below showing, which is acceptable. */
    }
  } else if (layer.type === 'text' && content) {
    const fontSize = ((style.fontSizePct ?? 4) / 100) * height;
    const weight = style.fontWeight ?? 400;
    const text = style.textTransform === 'uppercase' ? content.toUpperCase() : content;

    ctx.font = `${weight} ${fontSize}px ${style.fontFamily ?? FONT_STACK}`;
    ctx.fillStyle = style.color ?? '#000000';
    ctx.textBaseline = 'top';

    if (style.letterSpacing) {
      // letterSpacing is widely supported now; harmless where it is not.
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
        `${style.letterSpacing}px`;
    }

    const lines = wrapText(ctx, text, w);
    const lineHeight = fontSize * (style.lineHeight ?? 1.25);
    const blockHeight = lines.length * lineHeight;

    let cursorY = y;
    if (style.verticalAlign === 'center') cursorY = y + (h - blockHeight) / 2;
    else if (style.verticalAlign === 'bottom') cursorY = y + h - blockHeight;

    for (const line of lines) {
      const lineWidth = ctx.measureText(line).width;
      let lineX = x;
      if (style.align === 'center') lineX = x + (w - lineWidth) / 2;
      else if (style.align === 'right') lineX = x + w - lineWidth;
      ctx.fillText(line, lineX, cursorY);
      cursorY += lineHeight;
    }

    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = 'normal';
  }

  ctx.restore();
}

/** Draws a creative onto a canvas at its full output resolution. */
export async function renderToCanvas(spec: CreativeSpec): Promise<HTMLCanvasElement> {
  await ensureFontsReady();

  const { w: width, h: height } = ASPECT_RATIOS[spec.ratio];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Sequential rather than parallel: layers paint in order, back to front.
  for (const layer of visibleLayers(spec.template, spec.ratio)) {
    await drawLayer(ctx, layer, spec, width, height);
  }

  return canvas;
}

export async function renderToDataUrl(spec: CreativeSpec): Promise<string> {
  const canvas = await renderToCanvas(spec);
  return canvas.toDataURL('image/png');
}

/** PNG blob for upload. JPEG would be smaller but loses crispness on text. */
export async function renderToBlob(spec: CreativeSpec): Promise<Blob> {
  const canvas = await renderToCanvas(spec);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not export the image.'))),
      'image/png',
    );
  });
}

export function ratioLabel(ratio: AspectRatioKey): string {
  return ASPECT_RATIOS[ratio].label;
}
