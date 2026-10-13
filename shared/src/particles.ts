/**
 * Particle effects.
 *
 * Positions are a pure function of time and a per-particle seed rather than a
 * stepped simulation. That means the preview and the recording produce exactly
 * the same frames, scrubbing to any moment is correct, and a dropped frame
 * during recording cannot make the animation drift.
 */

export const PARTICLE_EFFECTS = [
  'snow',
  'confetti',
  'petals',
  'sparkles',
  'bubbles',
  'embers',
  'hearts',
  'bokeh',
] as const;

export type ParticleEffect = (typeof PARTICLE_EFFECTS)[number];

export const PARTICLE_LABELS: Record<ParticleEffect, string> = {
  snow: 'Snow',
  confetti: 'Confetti',
  petals: 'Flower petals',
  sparkles: 'Sparkles',
  bubbles: 'Bubbles',
  embers: 'Embers',
  hearts: 'Hearts',
  bokeh: 'Soft lights',
};

export interface ParticleSettings {
  effect: ParticleEffect;
  /** How many are on screen at once. */
  count: number;
  /** Multiplier on the effect's natural pace. */
  speed: number;
  /** Multiplier on the effect's natural size. */
  size: number;
  /** Overrides the effect's own palette when set. */
  color?: string;
  opacity: number;
}

export const DEFAULT_PARTICLE_SETTINGS: ParticleSettings = {
  effect: 'sparkles',
  count: 40,
  speed: 1,
  size: 1,
  opacity: 0.9,
};

/** Palettes used when no colour is chosen. */
export const PARTICLE_PALETTES: Record<ParticleEffect, string[]> = {
  snow: ['#ffffff', '#e0f2fe'],
  confetti: ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'],
  petals: ['#fda4af', '#fb7185', '#fecdd3', '#f9a8d4'],
  sparkles: ['#fde68a', '#fef3c7', '#ffffff'],
  bubbles: ['#bae6fd', '#e0f2fe'],
  embers: ['#fb923c', '#f97316', '#fbbf24'],
  hearts: ['#fb7185', '#f43f5e', '#fda4af'],
  bokeh: ['#ffffff', '#fde68a', '#bfdbfe'],
};

/**
 * Deterministic pseudo-random in 0..1 from an integer seed.
 *
 * A hash rather than Math.random: every particle must land in the same place
 * on every frame of every render.
 */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface ParticleState {
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  color: string;
}

/** Whether an effect falls, rises, or stays put and twinkles. */
function direction(effect: ParticleEffect): 'down' | 'up' | 'still' {
  if (effect === 'bubbles' || effect === 'embers') return 'up';
  if (effect === 'sparkles' || effect === 'bokeh') return 'still';
  return 'down';
}

/** Natural pace and scale per effect, before the user's multipliers. */
const PROFILE: Record<ParticleEffect, { speed: number; size: number; drift: number }> = {
  snow: { speed: 0.07, size: 0.012, drift: 2.2 },
  confetti: { speed: 0.16, size: 0.018, drift: 3.4 },
  petals: { speed: 0.09, size: 0.028, drift: 2.8 },
  sparkles: { speed: 0.5, size: 0.014, drift: 0 },
  bubbles: { speed: 0.1, size: 0.02, drift: 1.8 },
  embers: { speed: 0.13, size: 0.009, drift: 2.4 },
  hearts: { speed: 0.08, size: 0.024, drift: 2.0 },
  bokeh: { speed: 0.25, size: 0.05, drift: 0.6 },
};

/**
 * Where every particle is at a given moment.
 *
 * `width` and `height` are the canvas size; positions come back in pixels.
 */
export function particlesAt(
  settings: ParticleSettings,
  elapsed: number,
  width: number,
  height: number,
): ParticleState[] {
  const profile = PROFILE[settings.effect];
  const palette = settings.color ? [settings.color] : PARTICLE_PALETTES[settings.effect];
  const flow = direction(settings.effect);
  const states: ParticleState[] = [];

  for (let index = 0; index < settings.count; index++) {
    const r1 = seeded(index + 1);
    const r2 = seeded(index + 101);
    const r3 = seeded(index + 211);
    const r4 = seeded(index + 307);

    // Varying each particle's pace stops the field moving as one sheet.
    const pace = profile.speed * settings.speed * (0.6 + r2 * 0.8);
    const size = profile.size * settings.size * (0.6 + r3 * 0.9) * height;

    let x = r1 * width;
    let y: number;
    let opacity = settings.opacity;

    if (flow === 'still') {
      y = r2 * height;
      // Twinkle: each particle fades on its own cycle.
      const phase = (elapsed * pace + r4) % 1;
      opacity = settings.opacity * (0.25 + 0.75 * Math.abs(Math.sin(phase * Math.PI)));
    } else {
      // Wrapping keeps the field continuous without tracking state.
      const progress = (elapsed * pace + r4) % 1;
      const travel = height + size * 4;
      y = flow === 'down' ? progress * travel - size * 2 : height - progress * travel + size * 2;
      x += Math.sin(elapsed * profile.drift * 0.5 + r1 * 6.28) * width * 0.03;

      // Fade in and out at the edges so nothing pops into existence.
      const edge = Math.min(progress, 1 - progress) * 6;
      opacity = settings.opacity * Math.min(1, edge);
    }

    states.push({
      x,
      y,
      size,
      rotation: (elapsed * (0.4 + r3) * (settings.effect === 'confetti' ? 220 : 40)) % 360,
      opacity,
      color: palette[index % palette.length]!,
    });
  }

  return states;
}
