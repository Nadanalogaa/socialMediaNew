/**
 * Video (Reel) template model.
 *
 * A video is a sequence of scenes. Each scene reuses the same layer model as
 * still templates — so one field like a headline can appear in both — plus a
 * duration and an animation describing how it moves.
 *
 * Keeping animation to a small, named set is deliberate. Every option here
 * looks good with any content, which a freeform keyframe editor cannot
 * promise and a shop owner has no time to learn.
 */

import type { AspectRatioKey } from './domain.js';
import type { TemplateField, TemplateLayer } from './template.js';

/** How a layer enters its scene. */
export type LayerAnimation =
  | 'none'
  | 'fade-in'
  | 'rise'
  | 'slide-left'
  | 'slide-right'
  | 'pop'
  /** Slow drift across a photo, which keeps a still image feeling alive. */
  | 'ken-burns';

/** How one scene gives way to the next. */
export type SceneTransition = 'cut' | 'fade' | 'slide-up' | 'wipe';

export interface AnimatedLayer extends TemplateLayer {
  animation?: LayerAnimation;
  /** Seconds after the scene starts before this layer appears. */
  delaySeconds?: number;
}

export interface VideoScene {
  id: string;
  durationSeconds: number;
  layers: AnimatedLayer[];
  transitionIn?: SceneTransition;
}

export interface VideoTemplateDefinition {
  slug: string;
  name: string;
  kind: 'video';
  category: string;
  /** Reels are vertical; the model allows others for feed video later. */
  ratios: AspectRatioKey[];
  fields: TemplateField[];
  scenes: VideoScene[];
}

export interface VideoSpec {
  template: VideoTemplateDefinition;
  values: Record<string, string>;
  ratio: AspectRatioKey;
}

export function videoDurationSeconds(template: VideoTemplateDefinition): number {
  return template.scenes.reduce((total, scene) => total + scene.durationSeconds, 0);
}

/** Instagram rejects Reels shorter than this. */
export const MIN_REEL_SECONDS = 3;
export const MAX_REEL_SECONDS = 90;

/**
 * Eases a 0..1 progress value.
 *
 * Linear motion reads as mechanical; this curve starts fast and settles,
 * which is what makes text feel placed rather than slid.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
}

/** Progress of a layer's entrance at a given time within its scene. */
export function layerProgress(layer: AnimatedLayer, sceneElapsed: number): number {
  const delay = layer.delaySeconds ?? 0;
  const ENTRANCE_SECONDS = 0.55;
  if (sceneElapsed <= delay) return 0;
  return easeOutCubic((sceneElapsed - delay) / ENTRANCE_SECONDS);
}
