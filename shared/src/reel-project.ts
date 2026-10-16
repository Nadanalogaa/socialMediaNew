/**
 * Editable reel project.
 *
 * A template seeds a project; from then on the project is the document and the
 * template is forgotten. Layers carry their content directly rather than
 * binding to template fields, which is what lets a user add, delete, move and
 * restyle anything without the template constraining them.
 */

import type { AspectRatioKey } from './domain.js';
import type { ParticleSettings } from './particles.js';
import { DEFAULT_PARTICLE_SETTINGS } from './particles.js';
import type { LayerStyle } from './template.js';
import type { LayerAnimation, SceneTransition, VideoTemplateDefinition } from './video.js';
import { resolveLayerContent } from './template.js';

export interface ProjectLayer {
  id: string;
  type: 'text' | 'image' | 'shape' | 'particles';
  /** Shown in the layer list; defaults from the content. */
  name: string;
  /** Text, an image URL, or a colour, depending on `type`. */
  content: string;
  box: { x: number; y: number; w: number; h: number };
  style: LayerStyle;
  animation: LayerAnimation;
  delaySeconds: number;
  hidden?: boolean;
  /** Only on a `particles` layer. */
  particles?: ParticleSettings;
}

export interface ProjectScene {
  id: string;
  name: string;
  durationSeconds: number;
  transitionIn: SceneTransition;
  /** Painted back to front, as in any layer-based editor. */
  layers: ProjectLayer[];
}

/**
 * Music or voiceover mixed into the recording.
 *
 * The file is the user's own: using someone else's music gets a post muted or
 * removed by the platforms, so nothing is bundled here.
 */
export interface ProjectAudio {
  url: string;
  name: string;
  /** 0..1 */
  volume: number;
  /** Seconds into the track to begin, for skipping a long intro. */
  startSeconds: number;
  /** Seconds into the track to stop. Omitted means play to the end. */
  endSeconds?: number;
  /** Total length of the uploaded file, so the editor can draw a range. */
  durationSeconds?: number;
  /** Fades the last second out, so a reel does not end mid-note. */
  fadeOut: boolean;
}

/**
 * The brief a reel was built from, kept so it can be reopened and edited.
 *
 * Without this the text that produced a reel was gone the moment the dialog
 * closed, and changing one word meant retyping all of it.
 */
export interface MagicBrief {
  /** Its row in the brief history, once saved. */
  id?: string;
  brief: string;
  scenePhotos: Record<number, string>;
  brandColor: string;
  accentColor: string;
}

export interface ReelProject {
  name: string;
  ratio: AspectRatioKey;
  scenes: ProjectScene[];
  audio?: ProjectAudio;
  magic?: MagicBrief;
}

export function projectDuration(project: ReelProject): number {
  return project.scenes.reduce((total, scene) => total + scene.durationSeconds, 0);
}

let idCounter = 0;
/** Stable within a session; projects are saved whole, so it need not persist. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Converts a template and its filled-in values into an editable project.
 *
 * Bound fields are resolved to literal content here — after this point the
 * user edits the words directly rather than through the form.
 */
export function projectFromTemplate(
  template: VideoTemplateDefinition,
  values: Record<string, string>,
  ratio: AspectRatioKey = 'story',
): ReelProject {
  return {
    name: template.name,
    ratio,
    scenes: template.scenes.map((scene, sceneIndex) => ({
      id: newId('scene'),
      name: `Scene ${sceneIndex + 1}`,
      durationSeconds: scene.durationSeconds,
      transitionIn: scene.transitionIn ?? 'cut',
      layers: scene.layers.map((layer) => {
        const content =
          resolveLayerContent(layer, values, { fields: template.fields } as never) ?? '';
        return {
          id: newId('layer'),
          type: layer.type,
          name: layerName(layer.type, content),
          content:
            layer.type === 'shape' ? content || layer.style?.background || '#000000' : content,
          box: layer.boxByRatio?.[ratio] ?? layer.box,
          style: { ...layer.style },
          animation: layer.animation ?? 'none',
          delaySeconds: layer.delaySeconds ?? 0,
        };
      }),
    })),
  };
}

function layerName(type: ProjectLayer['type'], content: string): string {
  if (type === 'text') return content.slice(0, 24) || 'Text';
  if (type === 'image') return 'Photo';
  return 'Background';
}

// --- Editing helpers ------------------------------------------------------
// Pure functions returning new objects, so the editor's undo is just keeping
// previous values rather than reversing mutations.

export function createTextLayer(text = 'Your text'): ProjectLayer {
  return {
    id: newId('layer'),
    type: 'text',
    name: text.slice(0, 24),
    content: text,
    box: { x: 10, y: 44, w: 80, h: 12 },
    style: {
      fontSizePct: 5.5,
      fontWeight: 700,
      color: '#ffffff',
      align: 'center',
      verticalAlign: 'center',
      lineHeight: 1.2,
      shadow: { color: 'rgba(0,0,0,0.45)', blur: 18, offsetY: 2 },
    },
    animation: 'letter-rise',
    delaySeconds: 0,
  };
}

export function createImageLayer(url: string, isLogo = false): ProjectLayer {
  return {
    id: newId('layer'),
    type: 'image',
    name: isLogo ? 'Logo' : 'Photo',
    content: url,
    box: isLogo ? { x: 38, y: 6, w: 24, h: 10 } : { x: 0, y: 0, w: 100, h: 100 },
    style: { fit: isLogo ? 'contain' : 'cover', opacity: 1 },
    animation: isLogo ? 'fade-in' : 'ken-burns',
    delaySeconds: 0,
  };
}

/** An effect layer covering the whole frame by default. */
export function createParticleLayer(settings?: Partial<ParticleSettings>): ProjectLayer {
  const particles = { ...DEFAULT_PARTICLE_SETTINGS, ...settings };
  return {
    id: newId('layer'),
    type: 'particles',
    name: 'Effect',
    content: particles.effect,
    box: { x: 0, y: 0, w: 100, h: 100 },
    style: {},
    animation: 'none',
    delaySeconds: 0,
    particles,
  };
}

export function createShapeLayer(color = '#0f172a'): ProjectLayer {
  return {
    id: newId('layer'),
    type: 'shape',
    name: 'Background',
    content: color,
    box: { x: 0, y: 0, w: 100, h: 100 },
    style: { background: color },
    animation: 'none',
    delaySeconds: 0,
  };
}

export function duplicateScene(scene: ProjectScene): ProjectScene {
  return {
    ...scene,
    id: newId('scene'),
    name: `${scene.name} copy`,
    layers: scene.layers.map((layer) => ({ ...layer, id: newId('layer'), style: { ...layer.style } })),
  };
}

/** Moves an item within a list, used for layer and scene reordering. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Reuses one photo across every scene.
 *
 * A scene's *background* photo is the full-bleed one, so a logo or any other
 * small image layer is left alone — replacing those would be surprising.
 */
export function applyImageToAllScenes(project: ReelProject, url: string): ReelProject {
  return {
    ...project,
    scenes: project.scenes.map((scene) => {
      const background = scene.layers.find(
        (layer) => layer.type === 'image' && layer.box.w >= 80 && layer.box.h >= 80,
      );
      if (background) {
        return {
          ...scene,
          layers: scene.layers.map((layer) =>
            layer.id === background.id ? { ...layer, content: url } : layer,
          ),
        };
      }
      // No background photo in this scene yet, so put one behind everything.
      return { ...scene, layers: [createImageLayer(url), ...scene.layers] };
    }),
  };
}

/** Every distinct photo already used in the project, for the picker. */
export function projectPhotos(project: ReelProject): string[] {
  const seen = new Set<string>();
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === 'image' && layer.content) seen.add(layer.content);
    }
  }
  return [...seen];
}
