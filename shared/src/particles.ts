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
  // Depth-projected and simulated effects.
  'blast',
  'fireworks',
  'smoke',
  'starfield',
  'rain',
  'dust',
  'swirl',
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
  blast: 'Confetti blast',
  fireworks: 'Fireworks',
  smoke: 'Smoke',
  starfield: 'Flying through stars',
  rain: 'Rain',
  dust: 'Floating dust',
  swirl: 'Magic swirl',
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
  blast: ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#fde68a'],
  fireworks: ['#fde68a', '#fb7185', '#67e8f9', '#c4b5fd', '#86efac'],
  smoke: ['#cbd5e1', '#e2e8f0', '#94a3b8'],
  starfield: ['#ffffff', '#dbeafe', '#fef3c7'],
  rain: ['#bfdbfe', '#e0f2fe'],
  dust: ['#fef3c7', '#ffffff', '#fde68a'],
  swirl: ['#c4b5fd', '#f0abfc', '#93c5fd', '#fde68a'],
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
  /**
   * 0 is nearest the viewer, 1 is furthest. Used to blur and dim what is far
   * away, which is what makes a flat canvas read as having depth.
   */
  depth?: number;
  /** Rain and comets draw as a streak rather than a dot. */
  streak?: number;
}

/** Whether an effect falls, rises, or stays put and twinkles. */
function direction(effect: ParticleEffect): 'down' | 'up' | 'still' {
  if (effect === 'bubbles' || effect === 'embers') return 'up';
  if (effect === 'sparkles' || effect === 'bokeh') return 'still';
  return 'down';
}

/** Natural pace and scale per effect, before the user's multipliers. */
const PROFILE: Record<ParticleEffect, { speed: number; size: number; drift: number }> = {
  blast: { speed: 0.35, size: 0.016, drift: 0 },
  fireworks: { speed: 0.3, size: 0.01, drift: 0 },
  smoke: { speed: 0.08, size: 0.09, drift: 1.2 },
  starfield: { speed: 0.3, size: 0.012, drift: 0 },
  rain: { speed: 0.9, size: 0.004, drift: 0.4 },
  dust: { speed: 0.05, size: 0.01, drift: 1.6 },
  swirl: { speed: 0.25, size: 0.012, drift: 0 },
  snow: { speed: 0.07, size: 0.012, drift: 2.2 },
  confetti: { speed: 0.16, size: 0.018, drift: 3.4 },
  petals: { speed: 0.09, size: 0.028, drift: 2.8 },
  sparkles: { speed: 0.5, size: 0.014, drift: 0 },
  bubbles: { speed: 0.1, size: 0.02, drift: 1.8 },
  embers: { speed: 0.13, size: 0.009, drift: 2.4 },
  hearts: { speed: 0.08, size: 0.024, drift: 2.0 },
  bokeh: { speed: 0.25, size: 0.05, drift: 0.6 },
};

/** Smooth pseudo-noise, for turbulence that wanders rather than jitters. */
function noise(seed: number, t: number): number {
  return (
    Math.sin(t * 1.3 + seed * 12.9) * 0.5 +
    Math.sin(t * 2.7 + seed * 78.2) * 0.3 +
    Math.sin(t * 0.7 + seed * 43.1) * 0.2
  );
}

/**
 * Perspective projection.
 *
 * Scaling by `focal / (focal + z)` is what gives a flat canvas depth: a
 * particle twice as far away draws half the size and drifts half as fast
 * across the frame.
 */
function project(
  x: number,
  y: number,
  z: number,
  centreX: number,
  centreY: number,
): { x: number; y: number; scale: number } {
  const focal = 1;
  const scale = focal / (focal + z);
  return {
    x: centreX + (x - centreX) * scale,
    y: centreY + (y - centreY) * scale,
    scale,
  };
}

/**
 * Effects that simulate rather than simply fall.
 *
 * Returns null for the plain effects so the original path handles them.
 */
function advancedParticles(
  settings: ParticleSettings,
  elapsed: number,
  width: number,
  height: number,
): ParticleState[] | null {
  const { effect, count } = settings;
  const profile = PROFILE[effect];
  const palette = settings.color ? [settings.color] : PARTICLE_PALETTES[effect];
  const states: ParticleState[] = [];
  const centreX = width / 2;
  const centreY = height / 2;
  const pace = profile.speed * settings.speed;

  switch (effect) {
    case 'blast': {
      // Everything bursts together, flies out, and decelerates — a cannon,
      // not a drizzle. The cycle repeats so a short reel still sees one.
      const cycle = (elapsed * pace * 0.5) % 1;
      const eased = 1 - Math.pow(1 - cycle, 3);

      for (let i = 0; i < count; i++) {
        const angle = seeded(i + 1) * Math.PI * 2;
        const power = 0.35 + seeded(i + 51) * 0.65;
        const distance = eased * power * Math.min(width, height) * 0.9;

        states.push({
          x: centreX + Math.cos(angle) * distance,
          // Gravity pulls the arc down as it slows.
          y: centreY + Math.sin(angle) * distance + Math.pow(cycle, 2) * height * 0.35,
          size: profile.size * settings.size * height * (0.6 + seeded(i + 97) * 0.8),
          rotation: (elapsed * 400 + i * 37) % 360,
          opacity: settings.opacity * Math.max(0, 1 - Math.pow(cycle, 1.6)),
          color: palette[i % palette.length]!,
        });
      }
      return states;
    }

    case 'fireworks': {
      // Several bursts, staggered so the sky is never empty or all at once.
      const bursts = 3;
      const perBurst = Math.max(6, Math.floor(count / bursts));

      for (let b = 0; b < bursts; b++) {
        const cycle = (elapsed * pace * 0.4 + b / bursts) % 1;
        const originX = (0.2 + seeded(b * 31 + 7) * 0.6) * width;
        const originY = (0.15 + seeded(b * 53 + 11) * 0.4) * height;
        const eased = 1 - Math.pow(1 - cycle, 2.5);
        const color = palette[b % palette.length]!;

        for (let i = 0; i < perBurst; i++) {
          const index = b * 1000 + i;
          const angle = (i / perBurst) * Math.PI * 2 + seeded(index) * 0.3;
          const reach = (0.5 + seeded(index + 13) * 0.5) * Math.min(width, height) * 0.3;

          states.push({
            x: originX + Math.cos(angle) * eased * reach,
            y: originY + Math.sin(angle) * eased * reach + Math.pow(cycle, 2) * height * 0.18,
            size: profile.size * settings.size * height * (0.7 + seeded(index + 29) * 0.6),
            rotation: 0,
            // A sharp fade is what makes a spark read as burning out.
            opacity: settings.opacity * Math.max(0, 1 - Math.pow(cycle, 1.2)),
            color,
            streak: 2.5,
          });
        }
      }
      return states;
    }

    case 'smoke': {
      for (let i = 0; i < count; i++) {
        const progress = (elapsed * pace + seeded(i + 3)) % 1;
        const wander = noise(i, elapsed * 0.6) * width * 0.12;

        states.push({
          x: seeded(i + 1) * width + wander,
          y: height - progress * height * 1.2,
          // Growing as it rises is what separates smoke from fog.
          size: profile.size * settings.size * height * (0.4 + progress * 1.4),
          rotation: noise(i + 5, elapsed * 0.3) * 40,
          opacity: settings.opacity * 0.35 * Math.sin(progress * Math.PI),
          color: palette[i % palette.length]!,
          depth: seeded(i + 71),
        });
      }
      return states;
    }

    case 'starfield': {
      // Stars approach the viewer: z runs to zero, so they accelerate and
      // swell at the edges exactly as they would flying through them.
      for (let i = 0; i < count; i++) {
        const z = 1 - ((elapsed * pace + seeded(i + 1)) % 1);
        const angle = seeded(i + 41) * Math.PI * 2;
        const radius = (0.1 + seeded(i + 83) * 0.9) * Math.max(width, height);
        const projected = project(
          centreX + Math.cos(angle) * radius,
          centreY + Math.sin(angle) * radius,
          z * 3,
          centreX,
          centreY,
        );

        states.push({
          x: projected.x,
          y: projected.y,
          size: profile.size * settings.size * height * projected.scale * 2,
          rotation: 0,
          opacity: settings.opacity * Math.min(1, (1 - z) * 2),
          color: palette[i % palette.length]!,
          depth: z,
          streak: 1 + (1 - z) * 4,
        });
      }
      return states;
    }

    case 'rain': {
      for (let i = 0; i < count; i++) {
        // Depth makes near drops fall faster, larger and more opaque, which
        // is what gives a flat sheet of lines a sense of volume.
        const depth = seeded(i + 61);
        const progress = (elapsed * pace * (1.4 - depth * 0.7) + seeded(i + 7)) % 1;

        states.push({
          x: seeded(i + 1) * width + progress * width * 0.04,
          y: progress * (height + 120) - 60,
          size: profile.size * settings.size * height * (1.3 - depth * 0.6),
          rotation: 8,
          opacity: settings.opacity * (0.8 - depth * 0.45),
          color: palette[i % palette.length]!,
          depth,
          streak: 14 - depth * 7,
        });
      }
      return states;
    }

    case 'dust': {
      for (let i = 0; i < count; i++) {
        const depth = seeded(i + 29);
        const t = elapsed * pace * (1.2 - depth * 0.8);

        states.push({
          // Wandering on both axes, at a rate set by depth, reads as motes
          // suspended in air rather than falling.
          x: (seeded(i + 1) + noise(i, t) * 0.06) * width,
          y: ((seeded(i + 17) + t * 0.15) % 1) * height + noise(i + 9, t) * height * 0.04,
          size: profile.size * settings.size * height * (1.4 - depth),
          rotation: 0,
          opacity: settings.opacity * (0.9 - depth * 0.6),
          color: palette[i % palette.length]!,
          depth,
        });
      }
      return states;
    }

    case 'swirl': {
      for (let i = 0; i < count; i++) {
        const ring = seeded(i + 1);
        const radius = (0.15 + ring * 0.6) * Math.min(width, height) * 0.7;
        // Inner rings turn faster, as they would under gravity.
        const angle = elapsed * pace * (2.4 - ring * 1.4) + seeded(i + 23) * Math.PI * 2;
        const bob = Math.sin(elapsed * 1.6 + i) * height * 0.02;

        states.push({
          x: centreX + Math.cos(angle) * radius,
          y: centreY + Math.sin(angle) * radius * 0.55 + bob,
          size: profile.size * settings.size * height * (0.6 + seeded(i + 59) * 0.8),
          rotation: (angle * 180) / Math.PI,
          // Fading on the far side of the orbit suggests it passes behind.
          opacity: settings.opacity * (0.45 + 0.55 * ((Math.sin(angle) + 1) / 2)),
          color: palette[i % palette.length]!,
          depth: (Math.sin(angle) + 1) / 2,
        });
      }
      return states;
    }

    default:
      return null;
  }
}

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
  const advanced = advancedParticles(settings, elapsed, width, height);
  if (advanced) return advanced;

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
