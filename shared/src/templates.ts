/**
 * Built-in ad templates.
 *
 * Each is pure data: fields the user fills, and layers describing how those
 * values are drawn. Layers are positioned in percentages, so one definition
 * renders square, story and landscape without being re-authored.
 *
 * The set is deliberately small and opinionated. A shop owner picking
 * "Festival offer" and typing six words gets a usable ad; the same person
 * facing a blank canvas does not.
 */

import type { TemplateDefinition } from './template.js';

/** Brand colours a template falls back to when the user sets none. */
const INK = '#0f172a';
const LIGHT = '#ffffff';

export const BUILT_IN_TEMPLATES: TemplateDefinition[] = [
  {
    slug: 'festival-offer',
    name: 'Festival offer',
    kind: 'image',
    category: 'Offers',
    ratios: ['square', 'portrait', 'story'],
    fields: [
      {
        key: 'occasion',
        label: 'Occasion',
        type: 'text',
        required: true,
        maxLength: 28,
        defaultValue: 'Diwali Special',
        aiHint: 'The festival or occasion, two or three words.',
      },
      {
        key: 'offer',
        label: 'The offer',
        type: 'text',
        required: true,
        maxLength: 18,
        defaultValue: '25% OFF',
        aiHint: 'The headline discount or deal, very short, e.g. "25% OFF".',
      },
      {
        key: 'detail',
        label: 'Details',
        type: 'text',
        required: false,
        maxLength: 60,
        defaultValue: 'On all classes booked this week',
        aiHint: 'One short line qualifying the offer.',
      },
      {
        key: 'cta',
        label: 'Call to action',
        type: 'text',
        required: true,
        maxLength: 24,
        defaultValue: 'Book now',
        aiHint: 'Two or three words telling the reader what to do.',
      },
      { key: 'photo', label: 'Background photo', type: 'image', required: false },
      {
        key: 'brandColor',
        label: 'Brand colour',
        type: 'color',
        required: false,
        defaultValue: '#4f46e5',
      },
    ],
    layers: [
      {
        id: 'bg',
        type: 'shape',
        box: { x: 0, y: 0, w: 100, h: 100 },
        bind: 'brandColor',
        style: { background: '#4f46e5' },
      },
      {
        id: 'photo',
        type: 'image',
        bind: 'photo',
        box: { x: 0, y: 0, w: 100, h: 100 },
        style: { fit: 'cover', overlay: 'rgba(15,23,42,0.55)' },
      },
      {
        id: 'occasion',
        type: 'text',
        bind: 'occasion',
        box: { x: 10, y: 18, w: 80, h: 10 },
        style: {
          fontSizePct: 4.2,
          fontWeight: 600,
          color: LIGHT,
          align: 'center',
          textTransform: 'uppercase',
          letterSpacing: 2,
        },
      },
      {
        id: 'offer',
        type: 'text',
        bind: 'offer',
        box: { x: 8, y: 31, w: 84, h: 22 },
        style: { fontSizePct: 14, fontWeight: 800, color: LIGHT, align: 'center', lineHeight: 1.05 },
      },
      {
        id: 'detail',
        type: 'text',
        bind: 'detail',
        box: { x: 14, y: 56, w: 72, h: 12 },
        style: { fontSizePct: 3.6, fontWeight: 400, color: '#e2e8f0', align: 'center', lineHeight: 1.35 },
      },
      {
        id: 'ctaBox',
        type: 'shape',
        box: { x: 30, y: 74, w: 40, h: 9 },
        style: { background: LIGHT, borderRadiusPct: 50 },
      },
      {
        id: 'cta',
        type: 'text',
        bind: 'cta',
        box: { x: 30, y: 74, w: 40, h: 9 },
        style: { fontSizePct: 3.6, fontWeight: 700, color: INK, align: 'center', verticalAlign: 'center' },
      },
    ],
  },

  {
    slug: 'new-batch',
    name: 'New class or batch',
    kind: 'image',
    category: 'Announcements',
    ratios: ['square', 'portrait', 'story'],
    fields: [
      {
        key: 'eyebrow',
        label: 'Small heading',
        type: 'text',
        required: false,
        maxLength: 30,
        defaultValue: 'Admissions open',
        aiHint: 'A short label above the headline.',
      },
      {
        key: 'headline',
        label: 'Headline',
        type: 'text',
        required: true,
        maxLength: 44,
        defaultValue: 'New Bharatanatyam Batch',
        aiHint: 'What is being announced, under eight words.',
      },
      {
        key: 'details',
        label: 'Details',
        type: 'longtext',
        required: false,
        maxLength: 110,
        defaultValue: 'Weekends · Beginners welcome · Ages 6+',
        aiHint: 'Two or three short facts separated by the character ·',
      },
      {
        key: 'contact',
        label: 'Contact',
        type: 'text',
        required: false,
        maxLength: 40,
        defaultValue: 'Call 98765 43210',
      },
      { key: 'photo', label: 'Photo', type: 'image', required: false },
      {
        key: 'brandColor',
        label: 'Brand colour',
        type: 'color',
        required: false,
        defaultValue: '#0f172a',
      },
    ],
    layers: [
      { id: 'bg', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, style: { background: LIGHT } },
      {
        id: 'photo',
        type: 'image',
        bind: 'photo',
        box: { x: 0, y: 0, w: 100, h: 46 },
        boxByRatio: { story: { x: 0, y: 0, w: 100, h: 40 } },
        style: { fit: 'cover' },
      },
      {
        id: 'panel',
        type: 'shape',
        box: { x: 0, y: 44, w: 100, h: 56 },
        boxByRatio: { story: { x: 0, y: 38, w: 100, h: 62 } },
        bind: 'brandColor',
        style: { background: '#0f172a' },
      },
      {
        id: 'eyebrow',
        type: 'text',
        bind: 'eyebrow',
        box: { x: 9, y: 50, w: 82, h: 6 },
        boxByRatio: { story: { x: 9, y: 45, w: 82, h: 5 } },
        style: {
          fontSizePct: 3,
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 2,
        },
      },
      {
        id: 'headline',
        type: 'text',
        bind: 'headline',
        box: { x: 9, y: 57, w: 82, h: 20 },
        boxByRatio: { story: { x: 9, y: 52, w: 82, h: 22 } },
        style: { fontSizePct: 7.6, fontWeight: 800, color: LIGHT, lineHeight: 1.12 },
      },
      {
        id: 'details',
        type: 'text',
        bind: 'details',
        box: { x: 9, y: 78, w: 82, h: 10 },
        boxByRatio: { story: { x: 9, y: 76, w: 82, h: 12 } },
        style: { fontSizePct: 3.4, fontWeight: 400, color: '#cbd5e1', lineHeight: 1.4 },
      },
      {
        id: 'contact',
        type: 'text',
        bind: 'contact',
        box: { x: 9, y: 90, w: 82, h: 7 },
        style: { fontSizePct: 3.2, fontWeight: 700, color: LIGHT },
      },
    ],
  },

  {
    slug: 'quote-testimonial',
    name: 'Customer testimonial',
    kind: 'image',
    category: 'Social proof',
    ratios: ['square', 'portrait'],
    fields: [
      {
        key: 'quote',
        label: 'What they said',
        type: 'longtext',
        required: true,
        maxLength: 180,
        defaultValue: 'My daughter looks forward to every single class. The teaching is wonderful.',
        aiHint: 'A short customer quote in their own voice, one or two sentences.',
      },
      {
        key: 'author',
        label: 'Who said it',
        type: 'text',
        required: true,
        maxLength: 40,
        defaultValue: 'Priya R.',
      },
      {
        key: 'role',
        label: 'Their description',
        type: 'text',
        required: false,
        maxLength: 44,
        defaultValue: 'Parent, Sembakkam',
      },
      {
        key: 'brandColor',
        label: 'Background colour',
        type: 'color',
        required: false,
        defaultValue: '#eef2ff',
      },
    ],
    layers: [
      {
        id: 'bg',
        type: 'shape',
        bind: 'brandColor',
        box: { x: 0, y: 0, w: 100, h: 100 },
        style: { background: '#eef2ff' },
      },
      {
        id: 'mark',
        type: 'text',
        value: '“',
        box: { x: 10, y: 10, w: 30, h: 22 },
        style: { fontSizePct: 22, fontWeight: 800, color: '#c7d2fe' },
      },
      {
        id: 'quote',
        type: 'text',
        bind: 'quote',
        box: { x: 11, y: 30, w: 78, h: 38 },
        style: { fontSizePct: 5.4, fontWeight: 600, color: INK, lineHeight: 1.35 },
      },
      {
        id: 'rule',
        type: 'shape',
        box: { x: 11, y: 73, w: 12, h: 0.7 },
        style: { background: '#6366f1' },
      },
      {
        id: 'author',
        type: 'text',
        bind: 'author',
        box: { x: 11, y: 78, w: 78, h: 7 },
        style: { fontSizePct: 3.8, fontWeight: 700, color: INK },
      },
      {
        id: 'role',
        type: 'text',
        bind: 'role',
        box: { x: 11, y: 85, w: 78, h: 6 },
        style: { fontSizePct: 3, fontWeight: 400, color: '#64748b' },
      },
    ],
  },

  {
    slug: 'photo-caption',
    name: 'Photo with headline',
    kind: 'image',
    category: 'General',
    ratios: ['square', 'portrait', 'story', 'landscape'],
    fields: [
      { key: 'photo', label: 'Photo', type: 'image', required: true },
      {
        key: 'headline',
        label: 'Headline',
        type: 'text',
        required: true,
        maxLength: 50,
        defaultValue: 'Annual Day 2026',
        aiHint: 'A short, striking headline, under seven words.',
      },
      {
        key: 'subline',
        label: 'Supporting line',
        type: 'text',
        required: false,
        maxLength: 70,
        defaultValue: 'Thank you to every family who joined us',
      },
    ],
    layers: [
      { id: 'bg', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, style: { background: INK } },
      {
        id: 'photo',
        type: 'image',
        bind: 'photo',
        box: { x: 0, y: 0, w: 100, h: 100 },
        style: { fit: 'cover', overlay: 'linear-gradient(transparent 40%, rgba(15,23,42,0.85))' },
      },
      {
        id: 'headline',
        type: 'text',
        bind: 'headline',
        box: { x: 8, y: 70, w: 84, h: 16 },
        style: { fontSizePct: 8, fontWeight: 800, color: LIGHT, lineHeight: 1.1 },
      },
      {
        id: 'subline',
        type: 'text',
        bind: 'subline',
        box: { x: 8, y: 87, w: 84, h: 8 },
        style: { fontSizePct: 3.4, fontWeight: 400, color: '#e2e8f0', lineHeight: 1.3 },
      },
    ],
  },
];

export function findTemplate(slug: string): TemplateDefinition | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.slug === slug);
}
