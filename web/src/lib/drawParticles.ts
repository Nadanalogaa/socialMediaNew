/**
 * Drawing routines for each particle effect.
 *
 * Shapes are drawn rather than loaded as images: a confetti rectangle and a
 * petal are a few lines of canvas each, and nothing has to be downloaded or
 * licensed.
 */

import {
  particlesAt,
  type ParticleEffect,
  type ParticleSettings,
  type ParticleState,
} from '@socialboost/shared';

function drawStar(ctx: CanvasRenderingContext2D, size: number): void {
  // A four-point sparkle: long thin arms read better than a five-point star
  // at small sizes.
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(0, 0, size, 0);
  ctx.quadraticCurveTo(0, 0, 0, size);
  ctx.quadraticCurveTo(0, 0, -size, 0);
  ctx.quadraticCurveTo(0, 0, 0, -size);
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.5, -s * 0.4, -s * 1.1, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.4, -s * 1.1, s * 1.1, -s * 0.5, 0, s * 0.35);
  ctx.closePath();
  ctx.fill();
}

function drawPetal(ctx: CanvasRenderingContext2D, size: number): void {
  // An asymmetric ellipse reads as a petal where a circle reads as a dot.
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBubble(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(size * 0.12, 1);
  ctx.stroke();

  // A highlight is what makes a ring read as a bubble.
  ctx.beginPath();
  ctx.arc(-size * 0.3, -size * 0.3, size * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.7;
  ctx.fill();
}

function drawGlow(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
}

/** A streak, for rain and for sparks that are travelling fast. */
function drawStreak(
  ctx: CanvasRenderingContext2D,
  size: number,
  length: number,
  color: string,
): void {
  const gradient = ctx.createLinearGradient(0, -length * size, 0, length * size);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(size, 1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -length * size);
  ctx.lineTo(0, length * size);
  ctx.stroke();
}

/** A soft puff: several offset blobs read as volume where one circle does not. */
function drawSmoke(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  for (const [dx, dy, scale] of [
    [0, 0, 1],
    [-size * 0.45, size * 0.2, 0.75],
    [size * 0.4, size * 0.15, 0.8],
    [size * 0.1, -size * 0.4, 0.65],
  ] as const) {
    const gradient = ctx.createRadialGradient(dx, dy, 0, dx, dy, size * scale);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(dx, dy, size * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOne(
  ctx: CanvasRenderingContext2D,
  effect: ParticleEffect,
  particle: ParticleState,
): void {
  ctx.save();
  ctx.globalAlpha = particle.opacity;
  ctx.translate(particle.x, particle.y);
  ctx.rotate((particle.rotation * Math.PI) / 180);
  ctx.fillStyle = particle.color;

  // Distance softens what is far away, which sells the depth more than size
  // alone does.
  if (particle.depth !== undefined && particle.depth > 0.35) {
    ctx.filter = `blur(${((particle.depth - 0.35) * 4).toFixed(1)}px)`;
  }

  switch (effect) {
    case 'confetti':
      ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      break;
    case 'petals':
      drawPetal(ctx, particle.size);
      break;
    case 'sparkles':
      drawStar(ctx, particle.size);
      break;
    case 'hearts':
      drawHeart(ctx, particle.size);
      break;
    case 'bubbles':
      drawBubble(ctx, particle.size, particle.color);
      break;
    case 'embers':
    case 'bokeh':
    case 'dust':
      drawGlow(ctx, particle.size, particle.color);
      break;
    case 'blast':
      ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      break;
    case 'fireworks':
    case 'starfield':
      drawStreak(ctx, particle.size, particle.streak ?? 1, particle.color);
      break;
    case 'rain':
      drawStreak(ctx, particle.size, particle.streak ?? 8, particle.color);
      break;
    case 'smoke':
      drawSmoke(ctx, particle.size, particle.color);
      break;
    case 'swirl':
      drawStar(ctx, particle.size);
      break;
    case 'snow':
    default:
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  ctx.filter = 'none';
  ctx.restore();
}

/** Paints a whole effect for the given moment. */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  settings: ParticleSettings,
  elapsed: number,
  box: { x: number; y: number; w: number; h: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();
  // Clipped to the layer's box, so an effect can cover a corner rather than
  // always the whole frame.
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.translate(box.x, box.y);

  // Embers and soft lights look right as light rather than paint.
  if (
    settings.effect === 'embers' ||
    settings.effect === 'bokeh' ||
    settings.effect === 'sparkles' ||
    settings.effect === 'fireworks' ||
    settings.effect === 'starfield' ||
    settings.effect === 'dust' ||
    settings.effect === 'swirl'
  ) {
    ctx.globalCompositeOperation = 'lighter';
  }

  const particles = particlesAt(settings, elapsed, box.w, box.h);
  // Painting far to near is what makes the depth hold up where particles cross.
  if (particles.some((particle) => particle.depth !== undefined)) {
    particles.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));
  }

  for (const particle of particles) {
    drawOne(ctx, settings.effect, particle);
  }

  ctx.restore();
  void canvasWidth;
  void canvasHeight;
}
