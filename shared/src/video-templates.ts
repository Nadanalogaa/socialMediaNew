/**
 * Built-in Reel templates.
 *
 * Each is a short vertical video built from a handful of words and photos.
 * Durations are kept between 8 and 15 seconds: long enough to say something,
 * short enough that people watch to the end, which is what the platforms
 * reward.
 */

import type { VideoTemplateDefinition } from './video.js';

const LIGHT = '#ffffff';
const INK = '#0f172a';

export const BUILT_IN_VIDEO_TEMPLATES: VideoTemplateDefinition[] = [
  {
    slug: 'reel-offer',
    name: 'Offer reel',
    kind: 'video',
    category: 'Offers',
    ratios: ['story'],
    fields: [
      { key: 'photo1', label: 'First photo', type: 'image', required: true },
      { key: 'photo2', label: 'Second photo', type: 'image', required: false },
      {
        key: 'hook',
        label: 'Opening line',
        type: 'text',
        required: true,
        maxLength: 36,
        defaultValue: 'Learning Bharatanatyam?',
      },
      {
        key: 'offer',
        label: 'The offer',
        type: 'text',
        required: true,
        maxLength: 16,
        defaultValue: '25% OFF',
      },
      {
        key: 'detail',
        label: 'Details',
        type: 'text',
        required: false,
        maxLength: 54,
        defaultValue: 'First month, new students only',
      },
      {
        key: 'cta',
        label: 'Call to action',
        type: 'text',
        required: true,
        maxLength: 22,
        defaultValue: 'Book your place',
      },
      {
        key: 'brandColor',
        label: 'Brand colour',
        type: 'color',
        required: false,
        defaultValue: '#4f46e5',
      },
    ],
    scenes: [
      {
        id: 'hook',
        durationSeconds: 2.6,
        layers: [
          {
            id: 'photo',
            type: 'image',
            bind: 'photo1',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { fit: 'cover', overlay: 'rgba(15,23,42,0.5)' },
            animation: 'ken-burns',
          },
          {
            id: 'hook',
            type: 'text',
            bind: 'hook',
            box: { x: 10, y: 40, w: 80, h: 20 },
            style: { fontSizePct: 6.2, fontWeight: 800, color: LIGHT, align: 'center', lineHeight: 1.15 },
            animation: 'rise',
            delaySeconds: 0.25,
          },
        ],
      },
      {
        id: 'offer',
        durationSeconds: 3.2,
        transitionIn: 'fade',
        layers: [
          {
            id: 'bg',
            type: 'shape',
            bind: 'brandColor',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { background: '#4f46e5' },
          },
          {
            id: 'offer',
            type: 'text',
            bind: 'offer',
            box: { x: 6, y: 36, w: 88, h: 18 },
            style: { fontSizePct: 13, fontWeight: 800, color: LIGHT, align: 'center', lineHeight: 1.05 },
            animation: 'pop',
          },
          {
            id: 'detail',
            type: 'text',
            bind: 'detail',
            box: { x: 14, y: 56, w: 72, h: 10 },
            style: { fontSizePct: 3.4, fontWeight: 400, color: '#e0e7ff', align: 'center', lineHeight: 1.35 },
            animation: 'fade-in',
            delaySeconds: 0.5,
          },
        ],
      },
      {
        id: 'cta',
        durationSeconds: 3.0,
        transitionIn: 'slide-up',
        layers: [
          {
            id: 'photo',
            type: 'image',
            bind: 'photo2',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { fit: 'cover', overlay: 'rgba(15,23,42,0.6)' },
            animation: 'ken-burns',
          },
          {
            id: 'ctaBox',
            type: 'shape',
            box: { x: 16, y: 44, w: 68, h: 9 },
            style: { background: LIGHT, borderRadiusPct: 50 },
            animation: 'pop',
          },
          {
            id: 'cta',
            type: 'text',
            bind: 'cta',
            box: { x: 16, y: 44, w: 68, h: 9 },
            style: {
              fontSizePct: 3.8,
              fontWeight: 700,
              color: INK,
              align: 'center',
              verticalAlign: 'center',
            },
            animation: 'pop',
          },
        ],
      },
    ],
  },

  {
    slug: 'reel-announcement',
    name: 'Announcement reel',
    kind: 'video',
    category: 'Announcements',
    ratios: ['story'],
    fields: [
      { key: 'photo1', label: 'Photo', type: 'image', required: true },
      {
        key: 'eyebrow',
        label: 'Small heading',
        type: 'text',
        required: false,
        maxLength: 26,
        defaultValue: 'Admissions open',
      },
      {
        key: 'headline',
        label: 'Headline',
        type: 'text',
        required: true,
        maxLength: 40,
        defaultValue: 'New Weekend Batch',
      },
      {
        key: 'point1',
        label: 'Point one',
        type: 'text',
        required: false,
        maxLength: 34,
        defaultValue: 'Beginners welcome',
      },
      {
        key: 'point2',
        label: 'Point two',
        type: 'text',
        required: false,
        maxLength: 34,
        defaultValue: 'Ages 6 and above',
      },
      {
        key: 'contact',
        label: 'Contact',
        type: 'text',
        required: true,
        maxLength: 34,
        defaultValue: 'Call 98765 43210',
      },
      {
        key: 'brandColor',
        label: 'Brand colour',
        type: 'color',
        required: false,
        defaultValue: '#0f172a',
      },
    ],
    scenes: [
      {
        id: 'title',
        durationSeconds: 3.0,
        layers: [
          {
            id: 'photo',
            type: 'image',
            bind: 'photo1',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { fit: 'cover', overlay: 'rgba(15,23,42,0.55)' },
            animation: 'ken-burns',
          },
          {
            id: 'eyebrow',
            type: 'text',
            bind: 'eyebrow',
            box: { x: 10, y: 36, w: 80, h: 6 },
            style: {
              fontSizePct: 3,
              fontWeight: 600,
              color: '#cbd5e1',
              align: 'center',
              textTransform: 'uppercase',
              letterSpacing: 2,
            },
            animation: 'fade-in',
          },
          {
            id: 'headline',
            type: 'text',
            bind: 'headline',
            box: { x: 8, y: 44, w: 84, h: 20 },
            style: { fontSizePct: 7.4, fontWeight: 800, color: LIGHT, align: 'center', lineHeight: 1.12 },
            animation: 'rise',
            delaySeconds: 0.3,
          },
        ],
      },
      {
        id: 'points',
        durationSeconds: 3.4,
        transitionIn: 'slide-up',
        layers: [
          {
            id: 'bg',
            type: 'shape',
            bind: 'brandColor',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { background: '#0f172a' },
          },
          {
            id: 'p1',
            type: 'text',
            bind: 'point1',
            box: { x: 10, y: 38, w: 80, h: 9 },
            style: { fontSizePct: 4.6, fontWeight: 600, color: LIGHT, align: 'center' },
            animation: 'slide-left',
          },
          {
            id: 'p2',
            type: 'text',
            bind: 'point2',
            box: { x: 10, y: 50, w: 80, h: 9 },
            style: { fontSizePct: 4.6, fontWeight: 600, color: LIGHT, align: 'center' },
            animation: 'slide-right',
            delaySeconds: 0.45,
          },
        ],
      },
      {
        id: 'contact',
        durationSeconds: 2.6,
        transitionIn: 'fade',
        layers: [
          {
            id: 'bg',
            type: 'shape',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { background: LIGHT },
          },
          {
            id: 'contact',
            type: 'text',
            bind: 'contact',
            box: { x: 8, y: 44, w: 84, h: 12 },
            style: { fontSizePct: 6, fontWeight: 800, color: INK, align: 'center' },
            animation: 'pop',
          },
        ],
      },
    ],
  },

  {
    slug: 'reel-photo-story',
    name: 'Photo story reel',
    kind: 'video',
    category: 'General',
    ratios: ['story'],
    fields: [
      { key: 'photo1', label: 'Photo 1', type: 'image', required: true },
      { key: 'photo2', label: 'Photo 2', type: 'image', required: false },
      { key: 'photo3', label: 'Photo 3', type: 'image', required: false },
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        maxLength: 34,
        defaultValue: 'Annual Day 2026',
      },
      {
        key: 'closing',
        label: 'Closing line',
        type: 'text',
        required: false,
        maxLength: 40,
        defaultValue: 'Thank you for joining us',
      },
    ],
    scenes: [
      {
        id: 's1',
        durationSeconds: 2.8,
        layers: [
          {
            id: 'photo',
            type: 'image',
            bind: 'photo1',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { fit: 'cover', overlay: 'linear-gradient(transparent 45%, rgba(15,23,42,0.85))' },
            animation: 'ken-burns',
          },
          {
            id: 'title',
            type: 'text',
            bind: 'title',
            box: { x: 8, y: 74, w: 84, h: 14 },
            style: { fontSizePct: 6.6, fontWeight: 800, color: LIGHT, lineHeight: 1.1 },
            animation: 'rise',
            delaySeconds: 0.2,
          },
        ],
      },
      {
        id: 's2',
        durationSeconds: 2.6,
        transitionIn: 'wipe',
        layers: [
          {
            id: 'photo',
            type: 'image',
            bind: 'photo2',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { fit: 'cover' },
            animation: 'ken-burns',
          },
        ],
      },
      {
        id: 's3',
        durationSeconds: 2.6,
        transitionIn: 'wipe',
        layers: [
          {
            id: 'photo',
            type: 'image',
            bind: 'photo3',
            box: { x: 0, y: 0, w: 100, h: 100 },
            style: { fit: 'cover', overlay: 'rgba(15,23,42,0.45)' },
            animation: 'ken-burns',
          },
          {
            id: 'closing',
            type: 'text',
            bind: 'closing',
            box: { x: 10, y: 44, w: 80, h: 14 },
            style: { fontSizePct: 5.4, fontWeight: 700, color: LIGHT, align: 'center', lineHeight: 1.2 },
            animation: 'fade-in',
            delaySeconds: 0.4,
          },
        ],
      },
    ],
  },
];

export function findVideoTemplate(slug: string): VideoTemplateDefinition | undefined {
  return BUILT_IN_VIDEO_TEMPLATES.find((template) => template.slug === slug);
}
