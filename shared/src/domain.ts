/**
 * Core domain vocabulary shared by the API, the workers and the web/mobile client.
 * Everything the product can talk to, produce or bill for is named here exactly once.
 */

/** An external system we hold credentials for on behalf of an organization. */
export const PROVIDERS = [
  'facebook_page',
  'instagram_business',
  'youtube_channel',
  'whatsapp_business',
  'meta_ads',
  'google_ads',
] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Providers we can publish organic content to today. */
export const ORGANIC_PROVIDERS = [
  'facebook_page',
  'instagram_business',
  'youtube_channel',
] as const;
export type OrganicProvider = (typeof ORGANIC_PROVIDERS)[number];

/** Providers that own paid campaigns. Campaign management ships after ads API approval. */
export const AD_PROVIDERS = ['meta_ads', 'google_ads'] as const;
export type AdProvider = (typeof AD_PROVIDERS)[number];

export const CONNECTION_STATUSES = ['active', 'expired', 'revoked', 'error'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Creatives are either a still image or a video; every renderer targets one of these. */
export const CREATIVE_KINDS = ['image', 'video'] as const;
export type CreativeKind = (typeof CREATIVE_KINDS)[number];

/**
 * Canonical output sizes. Templates declare which they support so a single
 * creative can be rendered for several placements without re-authoring.
 */
export const ASPECT_RATIOS = {
  square: { w: 1080, h: 1080, label: 'Square 1:1' },
  portrait: { w: 1080, h: 1350, label: 'Portrait 4:5' },
  story: { w: 1080, h: 1920, label: 'Story / Reel 9:16' },
  landscape: { w: 1200, h: 628, label: 'Landscape 1.91:1' },
  youtube: { w: 1280, h: 720, label: 'YouTube 16:9' },
} as const;
export type AspectRatioKey = keyof typeof ASPECT_RATIOS;

export const POST_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'partially_failed',
  'failed',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Per-channel outcome of a post. A post is `partially_failed` when targets disagree. */
export const TARGET_STATUSES = ['pending', 'publishing', 'published', 'failed', 'skipped'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

// --- WhatsApp -------------------------------------------------------------
// The Cloud API only permits business-initiated messages to opted-in contacts
// using pre-approved templates. Consent state is therefore a first-class field,
// not a flag, and campaigns are throttled rather than blasted.

export const OPT_IN_STATUSES = ['pending', 'opted_in', 'opted_out'] as const;
export type OptInStatus = (typeof OPT_IN_STATUSES)[number];

/** How consent was obtained. Retained as evidence if Meta audits the account. */
export const OPT_IN_SOURCES = [
  'website_form',
  'whatsapp_reply',
  'imported_with_consent',
  'point_of_sale',
  'manual',
] as const;
export type OptInSource = (typeof OPT_IN_SOURCES)[number];

export const WA_TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type WaTemplateCategory = (typeof WA_TEMPLATE_CATEGORIES)[number];

export const WA_TEMPLATE_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'paused'] as const;
export type WaTemplateStatus = (typeof WA_TEMPLATE_STATUSES)[number];

export const WA_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
export type WaMessageStatus = (typeof WA_MESSAGE_STATUSES)[number];

// --- Billing & metering ---------------------------------------------------

export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Every billable action. Usage is written as an append-only event so quota
 * checks, invoices and analytics all read from the same source.
 */
export const USAGE_KINDS = [
  'ai_text',
  'ai_image',
  'ai_video',
  'creative_render',
  'post_publish',
  'wa_message',
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface PlanLimits {
  /** -1 means unlimited. */
  connections: number;
  postsPerMonth: number;
  aiTextPerMonth: number;
  aiImagePerMonth: number;
  aiVideoPerMonth: number;
  waMessagesPerMonth: number;
  seats: number;
}

export interface Plan {
  code: string;
  name: string;
  /** Paise, so ₹1,499 is 149900. Avoids float rounding on money. */
  priceInPaise: number;
  interval: 'monthly' | 'yearly';
  limits: PlanLimits;
}

/** Priced for Indian SMBs; Razorpay is the merchant. */
export const PLANS: Record<string, Plan> = {
  free: {
    code: 'free',
    name: 'Free',
    priceInPaise: 0,
    interval: 'monthly',
    limits: {
      connections: 1,
      postsPerMonth: 10,
      aiTextPerMonth: 25,
      aiImagePerMonth: 5,
      aiVideoPerMonth: 0,
      waMessagesPerMonth: 0,
      seats: 1,
    },
  },
  starter: {
    code: 'starter',
    name: 'Starter',
    priceInPaise: 79900,
    interval: 'monthly',
    limits: {
      connections: 3,
      postsPerMonth: 100,
      aiTextPerMonth: 300,
      aiImagePerMonth: 60,
      aiVideoPerMonth: 5,
      waMessagesPerMonth: 1000,
      seats: 2,
    },
  },
  growth: {
    code: 'growth',
    name: 'Growth',
    priceInPaise: 249900,
    interval: 'monthly',
    limits: {
      connections: 10,
      postsPerMonth: 500,
      aiTextPerMonth: 1500,
      aiImagePerMonth: 300,
      aiVideoPerMonth: 30,
      waMessagesPerMonth: 10000,
      seats: 5,
    },
  },
  scale: {
    code: 'scale',
    name: 'Scale',
    priceInPaise: 699900,
    interval: 'monthly',
    limits: {
      connections: -1,
      postsPerMonth: -1,
      aiTextPerMonth: 6000,
      aiImagePerMonth: 1200,
      aiVideoPerMonth: 120,
      waMessagesPerMonth: 100000,
      seats: 20,
    },
  },
};

/** Maps a usage kind to the plan limit that governs it, or null if unmetered. */
export const USAGE_LIMIT_KEY: Record<UsageKind, keyof PlanLimits | null> = {
  ai_text: 'aiTextPerMonth',
  ai_image: 'aiImagePerMonth',
  ai_video: 'aiVideoPerMonth',
  creative_render: null,
  post_publish: 'postsPerMonth',
  wa_message: 'waMessagesPerMonth',
};
