/**
 * Request contracts shared by client and server.
 *
 * The server validates with these schemas and the client infers its argument
 * types from them, so a change to a payload shape breaks the build on both
 * sides rather than at runtime in production.
 */

import { z } from 'zod';
import {
  ASPECT_RATIOS,
  CREATIVE_KINDS,
  OPT_IN_SOURCES,
  ORGANIC_PROVIDERS,
  PROVIDERS,
  ROLES,
  WA_TEMPLATE_CATEGORIES,
} from './domain.js';

const aspectRatioKeys = Object.keys(ASPECT_RATIOS) as [string, ...string[]];

// --- Auth -----------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(120),
  organizationName: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(ROLES),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

// --- Brand ----------------------------------------------------------------

/**
 * Replaces the hardcoded business description the legacy app baked into every
 * AI prompt. Each organization supplies its own, and it is injected as the
 * system instruction for all generation.
 */
export const brandProfileSchema = z.object({
  name: z.string().min(1).max(120),
  website: z.string().url().max(400).optional().or(z.literal('')),
  industry: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  toneOfVoice: z.string().max(400).optional(),
  targetAudience: z.string().max(600).optional(),
  logoUrl: z.string().url().max(1000).optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;

// --- Connections ----------------------------------------------------------

export const connectMetaSchema = z.object({
  /** Short-lived user token from the Facebook JS SDK, exchanged server-side. */
  userAccessToken: z.string().min(20).max(4000),
});
export type ConnectMetaInput = z.infer<typeof connectMetaSchema>;

/**
 * The legacy app auto-selected one hardcoded page. Tenants choose which of
 * their pages to link, so selection is an explicit second step.
 */
export const selectMetaAssetsSchema = z.object({
  pageIds: z.array(z.string().min(1).max(64)).min(1).max(25),
});
export type SelectMetaAssetsInput = z.infer<typeof selectMetaAssetsSchema>;

export const providerParamSchema = z.object({ provider: z.enum(PROVIDERS) });

// --- Creatives ------------------------------------------------------------

export const renderCreativeSchema = z.object({
  templateSlug: z.string().min(1).max(120),
  ratio: z.enum(aspectRatioKeys),
  values: z.record(z.string(), z.string().max(4000)),
  name: z.string().max(200).optional(),
});
export type RenderCreativeInput = z.infer<typeof renderCreativeSchema>;

/** Asks the LLM to fill a template's fields from a one-line brief. */
export const autofillTemplateSchema = z.object({
  templateSlug: z.string().min(1).max(120),
  brief: z.string().min(3).max(1000),
});
export type AutofillTemplateInput = z.infer<typeof autofillTemplateSchema>;

export const generateImageSchema = z.object({
  prompt: z.string().min(3).max(2000),
  ratio: z.enum(aspectRatioKeys).default('square'),
});
export type GenerateImageInput = z.infer<typeof generateImageSchema>;

// --- Publishing -----------------------------------------------------------

export const postTargetSchema = z.object({
  connectionId: z.string().uuid(),
  /** Per-channel caption override; falls back to the shared caption. */
  caption: z.string().max(5000).optional(),
});

export const createPostSchema = z
  .object({
    caption: z.string().max(5000),
    hashtags: z.array(z.string().max(80)).max(30).default([]),
    mediaAssetIds: z.array(z.string().uuid()).min(1).max(10),
    targets: z.array(postTargetSchema).min(1).max(20),
    /** Omit to publish immediately. */
    scheduledAt: z.coerce.date().optional(),
  })
  .refine((v) => !v.scheduledAt || v.scheduledAt.getTime() > Date.now(), {
    message: 'scheduledAt must be in the future',
    path: ['scheduledAt'],
  });
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const generateCaptionSchema = z.object({
  brief: z.string().min(3).max(1000),
  providers: z.array(z.enum(ORGANIC_PROVIDERS)).min(1),
});
export type GenerateCaptionInput = z.infer<typeof generateCaptionSchema>;

// --- WhatsApp -------------------------------------------------------------

/**
 * Contacts carry consent evidence. `optInSource` is required because Meta can
 * audit how a list was collected, and an unsourced list is a banned number.
 */
export const createContactSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be E.164, e.g. +919876543210'),
  name: z.string().max(200).optional(),
  optInSource: z.enum(OPT_IN_SOURCES),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const importContactsSchema = z.object({
  listId: z.string().uuid().optional(),
  optInSource: z.enum(OPT_IN_SOURCES),
  /** Explicit affirmation that these contacts consented; stored on every row. */
  consentConfirmed: z.literal(true),
  contacts: z.array(createContactSchema.omit({ optInSource: true })).min(1).max(10000),
});
export type ImportContactsInput = z.infer<typeof importContactsSchema>;

export const waTemplateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,512}$/, 'Lowercase letters, digits and underscores only'),
  language: z.string().min(2).max(10),
  category: z.enum(WA_TEMPLATE_CATEGORIES),
  bodyText: z.string().min(1).max(1024),
  headerText: z.string().max(60).optional(),
  footerText: z.string().max(60).optional(),
  /** Sample values for each {{n}} placeholder; Meta rejects templates without them. */
  exampleValues: z.array(z.string().max(500)).max(10).default([]),
});
export type WaTemplateInput = z.infer<typeof waTemplateSchema>;

export const waCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  listId: z.string().uuid(),
  templateId: z.string().uuid(),
  scheduledAt: z.coerce.date().optional(),
  /** Throttle protects the number's quality rating; capped well under Meta's tiers. */
  messagesPerMinute: z.number().int().min(1).max(600).default(60),
  variableMapping: z.record(z.string(), z.string().max(120)).default({}),
});
export type WaCampaignInput = z.infer<typeof waCampaignSchema>;

// --- Billing --------------------------------------------------------------

export const startSubscriptionSchema = z.object({
  planCode: z.string().min(1).max(40),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});
export type StartSubscriptionInput = z.infer<typeof startSubscriptionSchema>;

// --- Common ---------------------------------------------------------------

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(500).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const creativeKindSchema = z.enum(CREATIVE_KINDS);
