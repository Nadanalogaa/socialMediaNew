/**
 * Editable reel project.
 *
 * A template seeds a project; from then on the project is the document and the
 * template is forgotten. Layers carry their content directly rather than
 * binding to template fields, which is what lets a user add, delete, move and
 * restyle anything without the template constraining them.
 */

import type { AspectRatioKey } from './domain.js';
import type { LayerStyle } from './template.js';
import type { LayerAnimation, SceneTransition, VideoTemplateDefinition } from './video.js';
import { resolveLayerContent } from './template.js';

export interface ProjectLayer {
  id: string;
  type: 'text' | 'image' | 'shape';
  /** Shown in the layer list; defaults from the content. */
  name: string;
  /** Text, an image URL, or a colour, depending on `type`. */
  content: string;
  box: { x: number; y: number; w: number; h: number };
  style: LayerStyle;
  animation: LayerAnimation;
  delaySeconds: number;
  hidden?: boolean;
}

export interface ProjectScene {
  id: string;
  name: string;
  durationSeconds: number;
  transitionIn: SceneTransition;
  /** Painted back to front, as in any layer-based editor. */
  layers: ProjectLayer[];
}

export interface ReelProject {
  name: string;
  ratio: AspectRatioKey;
  scenes: ProjectScene[];
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

/** A photo reused across every scene, which is a common quick edit. */
export function applyImageToAllScenes(project: ReelProject, url: string): ReelProject {
  return {
    ...project,
    scenes: project.scenes.map((scene) => {
      const existing = scene.layers.find((layer) => layer.type === 'image');
      if (existing) {
        return {
          ...scene,
          layers: scene.layers.map((layer) =>
            layer.id === existing.id ? { ...layer, content: url } : layer,
          ),
        };
      }
      // No photo in this scene yet, so put one behind everything else.
      return { ...scene, layers: [createImageLayer(url), ...scene.layers] };
    }),
  };
}
