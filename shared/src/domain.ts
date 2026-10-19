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
  /** A Google Business Profile location: the listing on Search and Maps. */
  'google_business',
  /** A Search Console property: the queries a website ranks for. */
  'google_search_console',
] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Providers we can publish organic content to today. */
export const ORGANIC_PROVIDERS = [
  'facebook_page',
  'instagram_business',
  'youtube_channel',
  'google_business',
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
  /** Submitted by a member; waits for an owner, admin or client to approve. */
  'pending_approval',
  'scheduled',
  'publishing',
  'published',
  'partially_failed',
  'failed',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Per-channel outcome of a post. A post is `partially_failed` when targets disagree. */
export const TARGET_STATUSES = [
  'pending',
  'publishing',
  'published',
  'failed',
  'skipped',
  /** Published successfully, then removed on the platform itself. */
  'deleted_on_platform',
] as const;
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

/**
 * owner/admin run the workspace and publish; a member drafts and, when
 * approval is on, submits; a viewer (a client) only looks and approves.
 */
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Client (view & approve)',
};

/** Roles that may publish, schedule and approve. */
export const PUBLISHING_ROLES: Role[] = ['owner', 'admin'];
/** Roles that may create and edit posts. */
export const EDITING_ROLES: Role[] = ['owner', 'admin', 'member'];

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
  /** Paise per year; ten months for the price of twelve. */
  yearlyPriceInPaise: number;
  /** One line under the name on the plan card. */
  tagline: string;
  /** Bullet points on the plan card, in order. */
  highlights: string[];
  limits: PlanLimits;
}

/** Every new workspace tries Growth for this long before dropping to Free. */
export const TRIAL_DAYS = 14;

/** Prepaid, per workspace per month, for Indian SMBs; Razorpay is the merchant. */
export const PLANS: Record<string, Plan> = {
  free: {
    code: 'free',
    name: 'Free',
    priceInPaise: 0,
    yearlyPriceInPaise: 0,
    tagline: 'Try it with one page.',
    highlights: ['2 channels', '15 posts a month', '1 person', 'Reels & posters: 5 exports a month'],
    limits: {
      connections: 2,
      postsPerMonth: 15,
      aiTextPerMonth: 20,
      aiImagePerMonth: 0,
      aiVideoPerMonth: 0,
      waMessagesPerMonth: 0,
      seats: 1,
    },
  },
  starter: {
    code: 'starter',
    name: 'Starter',
    priceInPaise: 49900,
    yearlyPriceInPaise: 499000,
    tagline: 'For one business, posted properly.',
    highlights: ['5 channels', 'Unlimited posts', '2 people', 'Unlimited reels, posters & Magic Design', 'Calendar, queue, first comment'],
    limits: {
      connections: 5,
      postsPerMonth: -1,
      aiTextPerMonth: 200,
      aiImagePerMonth: 50,
      aiVideoPerMonth: 5,
      waMessagesPerMonth: 1000,
      seats: 2,
    },
  },
  growth: {
    code: 'growth',
    name: 'Growth',
    priceInPaise: 149900,
    yearlyPriceInPaise: 1499000,
    tagline: 'For a team, or a few brands.',
    highlights: ['15 channels', 'Unlimited posts', '5 people', 'Approvals & client reports', 'Everything in Starter'],
    limits: {
      connections: 15,
      postsPerMonth: -1,
      aiTextPerMonth: 1000,
      aiImagePerMonth: 200,
      aiVideoPerMonth: 20,
      waMessagesPerMonth: 10000,
      seats: 5,
    },
  },
  agency: {
    code: 'agency',
    name: 'Agency',
    priceInPaise: 399900,
    yearlyPriceInPaise: 3999000,
    tagline: 'For agencies with many clients.',
    highlights: ['50 channels', 'Unlimited posts', '15 people', 'Client workspaces & approvals', 'Everything in Growth'],
    limits: {
      connections: 50,
      postsPerMonth: -1,
      aiTextPerMonth: 5000,
      aiImagePerMonth: 1000,
      aiVideoPerMonth: 100,
      waMessagesPerMonth: 100000,
      seats: 15,
    },
  },
};

/** The paid plans, cheapest first — the order the cards are shown in. */
export const PLAN_ORDER = ['free', 'starter', 'growth', 'agency'] as const;

/** Earlier plan codes still stored on some workspaces. */
export const LEGACY_PLAN_CODES: Record<string, string> = { scale: 'agency' };

export function findPlan(code: string | null | undefined): Plan {
  const resolved = code ? (LEGACY_PLAN_CODES[code] ?? code) : 'free';
  return PLANS[resolved] ?? PLANS.free!;
}

/** Maps a usage kind to the plan limit that governs it, or null if unmetered. */
export const USAGE_LIMIT_KEY: Record<UsageKind, keyof PlanLimits | null> = {
  ai_text: 'aiTextPerMonth',
  ai_image: 'aiImagePerMonth',
  ai_video: 'aiVideoPerMonth',
  creative_render: null,
  post_publish: 'postsPerMonth',
  wa_message: 'waMessagesPerMonth',
};
