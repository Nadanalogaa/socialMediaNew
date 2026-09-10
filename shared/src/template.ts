/**
 * Ad template model.
 *
 * A template is data, not code: a list of *fields* the user fills in and a list
 * of *layers* describing how those values are drawn. This keeps the studio light
 * in both senses — the renderer is a pure function of JSON, and the user sees a
 * short form ("headline, offer, photo") instead of a blank canvas.
 *
 * The same definition drives every output size: layers are positioned in
 * percentages, so one template renders square, story and landscape without
 * being re-authored.
 */

import type { AspectRatioKey, CreativeKind } from './domain.js';

/** Input the user supplies. Deliberately few types — each maps to one form control. */
export type TemplateFieldType = 'text' | 'longtext' | 'image' | 'color';

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  /** Enforced in the editor so text cannot overflow its layer at render time. */
  maxLength?: number;
  placeholder?: string;
  defaultValue?: string;
  /** Steers the LLM when the user asks AI to fill this template in. */
  aiHint?: string;
}

/** Position as a percentage of the canvas, so layouts are resolution-independent. */
export interface LayerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayerStyle {
  /** Font size as a percentage of canvas height, so type scales with the output. */
  fontSizePct?: number;
  fontWeight?: number;
  fontFamily?: string;
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase';
  borderRadiusPct?: number;
  opacity?: number;
  /** Image only: how the picture fills its box. */
  fit?: 'cover' | 'contain';
  /** Darkens an image layer so text above it stays legible. */
  overlay?: string;
  paddingPct?: number;
}

export interface TemplateLayer {
  id: string;
  type: 'text' | 'image' | 'shape';
  box: LayerBox;
  /** Field key supplying this layer's content. Omit and use `value` for fixed content. */
  bind?: string;
  value?: string;
  style?: LayerStyle;
  /** Per-ratio box overrides, for when a story needs a different composition. */
  boxByRatio?: Partial<Record<AspectRatioKey, LayerBox>>;
  /** Hide this layer in specific output sizes. */
  hiddenIn?: AspectRatioKey[];
}

export interface TemplateDefinition {
  /** Stable identifier, e.g. `festival-offer-bold`. */
  slug: string;
  name: string;
  kind: CreativeKind;
  /** Grouping shown in the picker: "Offers", "Festivals", "Announcements". */
  category: string;
  /** Output sizes this layout is designed for; the first is the default. */
  ratios: AspectRatioKey[];
  fields: TemplateField[];
  layers: TemplateLayer[];
  /** Video only: total duration in seconds. */
  durationSeconds?: number;
}

/** A template plus the values a user filled in — the unit the renderer consumes. */
export interface CreativeSpec {
  template: TemplateDefinition;
  values: Record<string, string>;
  ratio: AspectRatioKey;
}

/** Resolves a layer's box for a given output size, honouring per-ratio overrides. */
export function resolveLayerBox(layer: TemplateLayer, ratio: AspectRatioKey): LayerBox {
  return layer.boxByRatio?.[ratio] ?? layer.box;
}

/** Layers actually drawn for an output size, in paint order. */
export function visibleLayers(
  definition: TemplateDefinition,
  ratio: AspectRatioKey,
): TemplateLayer[] {
  return definition.layers.filter((layer) => !layer.hiddenIn?.includes(ratio));
}

/**
 * Content for a layer: a bound field value, the user's own default, or a literal.
 * Returns null when a layer has nothing to draw so the renderer can skip it.
 */
export function resolveLayerContent(
  layer: TemplateLayer,
  values: Record<string, string>,
  definition: TemplateDefinition,
): string | null {
  if (!layer.bind) return layer.value ?? null;
  const supplied = values[layer.bind];
  if (supplied != null && supplied !== '') return supplied;
  const field = definition.fields.find((f) => f.key === layer.bind);
  return field?.defaultValue ?? null;
}

/** Missing-required-field check, used by both the editor and the render worker. */
export function findMissingFields(spec: CreativeSpec): TemplateField[] {
  return spec.template.fields.filter(
    (field) => field.required && !(spec.values[field.key] ?? field.defaultValue),
  );
}
