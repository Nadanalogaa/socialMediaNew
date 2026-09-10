/**
 * Database schema.
 *
 * Every tenant-owned row carries `organizationId` and is queried through a
 * helper that requires it, so cross-tenant reads fail closed rather than
 * depending on each call site remembering a WHERE clause.
 *
 * Ad campaign tables exist from the start even though campaign management
 * ships after Meta/Google API approval. Designing them now keeps the creative
 * and reporting code stable when those endpoints are switched on.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AspectRatioKey,
  CreativeKind,
  OptInSource,
  OptInStatus,
  PostStatus,
  Provider,
  Role,
  TargetStatus,
  UsageKind,
  WaMessageStatus,
  WaTemplateCategory,
  WaTemplateStatus,
} from '@socialboost/shared';
import type { TemplateDefinition } from '@socialboost/shared';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// --- Tenancy & identity ---------------------------------------------------

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    planCode: text('plan_code').notNull().default('free'),
    /** Set once Razorpay has a customer record for this org. */
    razorpayCustomerId: text('razorpay_customer_id'),
    ...timestamps,
  },
  (t) => [uniqueIndex('organizations_slug_idx').on(t.slug)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** scrypt hash; format is `scrypt$N$r$p$salt$hash`. Never a plaintext column. */
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

export const memberships = pgTable(
  'memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull().default('member'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index('memberships_user_idx').on(t.userId),
  ],
);

/**
 * Refresh tokens are stored hashed so a database leak cannot be replayed as a
 * session. Access tokens are short-lived JWTs and are not stored at all.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId),
  ],
);

// --- Brand ----------------------------------------------------------------

/**
 * Per-tenant brand voice. Injected as the system instruction for every AI call,
 * replacing the single hardcoded business the legacy app assumed.
 */
export const brandProfiles = pgTable(
  'brand_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    website: text('website'),
    industry: text('industry'),
    description: text('description'),
    toneOfVoice: text('tone_of_voice'),
    targetAudience: text('target_audience'),
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color'),
    secondaryColor: text('secondary_color'),
    ...timestamps,
  },
  (t) => [uniqueIndex('brand_profiles_org_idx').on(t.organizationId)],
);

// --- Channel connections --------------------------------------------------

/**
 * One row per connected asset (a Facebook Page, an IG business account, a
 * WhatsApp number, an ad account). Tokens are AES-256-GCM encrypted at rest;
 * the legacy app returned page tokens to the browser, which this replaces.
 */
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<Provider>().notNull(),
    /** The provider's own id: page id, ig user id, phone number id, customer id. */
    externalId: text('external_id').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: jsonb('scopes').$type<string[]>().default([]),
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    /** Provider-specific extras, e.g. the parent page id for an IG account. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('connections_org_provider_external_idx').on(
      t.organizationId,
      t.provider,
      t.externalId,
    ),
    index('connections_org_idx').on(t.organizationId),
  ],
);

// --- Media & creatives ----------------------------------------------------

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<CreativeKind>().notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: integer('duration_seconds'),
    bytes: integer('bytes'),
    /** How it got here: direct upload, AI generation, or a template render. */
    source: text('source').notNull().default('upload'),
    /** Cloudinary public_id, so the asset can be transformed or deleted later. */
    providerRef: text('provider_ref'),
    ...timestamps,
  },
  (t) => [index('media_assets_org_idx').on(t.organizationId, t.createdAt)],
);

/**
 * Templates ship as curated global rows (`organizationId` null) that every
 * tenant can use, plus tenant-owned copies once a user customises one.
 */
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<CreativeKind>().notNull(),
    category: text('category').notNull(),
    definition: jsonb('definition').$type<TemplateDefinition>().notNull(),
    thumbnailUrl: text('thumbnail_url'),
    isPublic: boolean('is_public').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('templates_org_slug_idx').on(t.organizationId, t.slug),
    index('templates_public_idx').on(t.isPublic, t.category),
  ],
);

/** A filled-in template. Kept separate from the render so it stays re-editable. */
export const creatives = pgTable(
  'creatives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => templates.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kind: text('kind').$type<CreativeKind>().notNull(),
    ratio: text('ratio').$type<AspectRatioKey>().notNull(),
    /** The user's field values, replayable against the template to re-render. */
    values: jsonb('values').$type<Record<string, string>>().notNull().default({}),
    status: text('status').notNull().default('draft'),
    renderedAssetId: uuid('rendered_asset_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('creatives_org_idx').on(t.organizationId, t.createdAt)],
);

// --- Organic publishing ---------------------------------------------------

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    caption: text('caption').notNull().default(''),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    status: text('status').$type<PostStatus>().notNull().default('draft'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('posts_org_idx').on(t.organizationId, t.createdAt),
    /** Drives the scheduler sweep for posts that are due. */
    index('posts_scheduled_idx').on(t.status, t.scheduledAt),
  ],
);

export const postMedia = pgTable(
  'post_media',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.mediaAssetId] })],
);

/**
 * One row per channel a post goes to. Publishing succeeds or fails per target,
 * which is why a post can be `partially_failed` rather than all-or-nothing.
 */
export const postTargets = pgTable(
  'post_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<Provider>().notNull(),
    /** Per-channel caption; falls back to the post's shared caption when null. */
    caption: text('caption'),
    status: text('status').$type<TargetStatus>().notNull().default('pending'),
    externalPostId: text('external_post_id'),
    permalink: text('permalink'),
    error: text('error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('post_targets_post_idx').on(t.postId),
    index('post_targets_connection_idx').on(t.connectionId),
  ],
);

/** Engagement snapshots. Append-only so growth over time can be charted. */
export const postMetrics = pgTable(
  'post_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postTargetId: uuid('post_target_id')
      .notNull()
      .references(() => postTargets.id, { onDelete: 'cascade' }),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    views: integer('views').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('post_metrics_target_idx').on(t.postTargetId, t.fetchedAt)],
);

// --- Paid ads (schema now, endpoints after API approval) -------------------

export const adAccounts = pgTable(
  'ad_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<Provider>().notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('INR'),
    ...timestamps,
  },
  (t) => [uniqueIndex('ad_accounts_provider_external_idx').on(t.provider, t.externalId)],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<Provider>().notNull(),
    externalId: text('external_id'),
    name: text('name').notNull(),
    objective: text('objective'),
    status: text('status').notNull().default('draft'),
    /** Paise, matching the plan pricing convention. */
    dailyBudget: integer('daily_budget'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('campaigns_org_idx').on(t.organizationId, t.createdAt)],
);

/** Links a creative to the campaign it runs in, once campaigns are enabled. */
export const campaignCreatives = pgTable(
  'campaign_creatives',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    creativeId: uuid('creative_id')
      .notNull()
      .references(() => creatives.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.creativeId] })],
);

// --- WhatsApp -------------------------------------------------------------

export const waContacts = pgTable(
  'wa_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** E.164, e.g. +919876543210. */
    phone: text('phone').notNull(),
    name: text('name'),
    attributes: jsonb('attributes').$type<Record<string, string>>().notNull().default({}),
    optInStatus: text('opt_in_status').$type<OptInStatus>().notNull().default('pending'),
    /** Consent evidence, retained in case Meta audits how the list was built. */
    optInSource: text('opt_in_source').$type<OptInSource>(),
    optInAt: timestamp('opt_in_at', { withTimezone: true }),
    optOutAt: timestamp('opt_out_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('wa_contacts_org_phone_idx').on(t.organizationId, t.phone),
    index('wa_contacts_optin_idx').on(t.organizationId, t.optInStatus),
  ],
);

export const waLists = pgTable(
  'wa_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [index('wa_lists_org_idx').on(t.organizationId)],
);

export const waListMembers = pgTable(
  'wa_list_members',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => waLists.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => waContacts.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.listId, t.contactId] })],
);

/** Mirrors a template registered with Meta; sends are blocked until approved. */
export const waTemplates = pgTable(
  'wa_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => connections.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    language: text('language').notNull().default('en'),
    category: text('category').$type<WaTemplateCategory>().notNull(),
    headerText: text('header_text'),
    bodyText: text('body_text').notNull(),
    footerText: text('footer_text'),
    exampleValues: jsonb('example_values').$type<string[]>().notNull().default([]),
    status: text('status').$type<WaTemplateStatus>().notNull().default('draft'),
    externalId: text('external_id'),
    rejectionReason: text('rejection_reason'),
    ...timestamps,
  },
  (t) => [uniqueIndex('wa_templates_org_name_lang_idx').on(t.organizationId, t.name, t.language)],
);

export const waCampaigns = pgTable(
  'wa_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => waLists.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => waTemplates.id, { onDelete: 'restrict' }),
    connectionId: uuid('connection_id').references(() => connections.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    status: text('status').notNull().default('draft'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Deliberate pacing: protects the number's quality rating. */
    messagesPerMinute: integer('messages_per_minute').notNull().default(60),
    variableMapping: jsonb('variable_mapping').$type<Record<string, string>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index('wa_campaigns_org_idx').on(t.organizationId, t.createdAt)],
);

export const waMessages = pgTable(
  'wa_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').references(() => waCampaigns.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => waContacts.id, { onDelete: 'cascade' }),
    status: text('status').$type<WaMessageStatus>().notNull().default('queued'),
    externalId: text('external_id'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('wa_messages_campaign_idx').on(t.campaignId, t.status),
    index('wa_messages_external_idx').on(t.externalId),
  ],
);

// --- Billing & metering ---------------------------------------------------

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    razorpaySubscriptionId: text('razorpay_subscription_id'),
    status: text('status').notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('subscriptions_org_idx').on(t.organizationId)],
);

/**
 * Append-only usage log. Quota enforcement, invoicing and the usage dashboard
 * all aggregate from here, so they can never disagree with each other.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<UsageKind>().notNull(),
    quantity: integer('quantity').notNull().default(1),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('usage_events_org_kind_idx').on(t.organizationId, t.kind, t.createdAt)],
);

/**
 * Data deletion requests from Meta.
 *
 * Meta requires a callback that accepts a deletion request and returns a status
 * URL plus a confirmation code the user can quote. Requests are recorded so
 * that URL has something to report, and so the deletion is auditable.
 */
export const dataDeletionRequests = pgTable(
  'data_deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Quoted back to the user; the status page looks up by this. */
    confirmationCode: text('confirmation_code').notNull(),
    provider: text('provider').notNull().default('meta'),
    /** The provider's user id the request concerns. */
    externalUserId: text('external_user_id').notNull(),
    status: text('status').notNull().default('pending'),
    connectionsDeleted: integer('connections_deleted').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('data_deletion_confirmation_idx').on(t.confirmationCode),
    index('data_deletion_external_user_idx').on(t.externalUserId),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ip: text('ip'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('audit_logs_org_idx').on(t.organizationId, t.createdAt)],
);
