/**
 * Meta Graph API client (Facebook Pages + Instagram Business).
 *
 * Ported from the previous single-tenant server, with three substantive changes:
 *
 *  1. Short-lived user tokens are exchanged for long-lived ones before page
 *     tokens are derived. The old code used the SDK's short-lived token
 *     directly, so page tokens silently expired after about an hour.
 *  2. Nothing is hardcoded to one page. Callers pass the page and token they
 *     resolved from the tenant's own connections.
 *  3. Graph errors are normalised into a typed error carrying the numeric code,
 *     so callers can distinguish "post was deleted" from "token is invalid"
 *     without string-matching messages.
 */

import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const GRAPH_VERSION = 'v23.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Graph error codes we branch on. */
export const GRAPH_ERROR = {
  /** Object does not exist — usually deleted, or never visible to this token. */
  UNKNOWN_OBJECT: 100,
  INSTAGRAM_OBJECT_MISSING: 10,
  POST_MISSING: 803,
  INVALID_TOKEN: 190,
  RATE_LIMITED: 4,
  PAGE_RATE_LIMITED: 32,
} as const;

export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly subcode?: number,
    readonly type?: string,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }

  /** True when the object is gone; callers usually treat this as success. */
  get isMissingObject(): boolean {
    return (
      this.code === GRAPH_ERROR.UNKNOWN_OBJECT ||
      this.code === GRAPH_ERROR.POST_MISSING ||
      this.code === GRAPH_ERROR.INSTAGRAM_OBJECT_MISSING
    );
  }

  /** True when the tenant must reconnect the account. */
  get isAuthError(): boolean {
    return this.code === GRAPH_ERROR.INVALID_TOKEN;
  }

  get isRateLimit(): boolean {
    return this.code === GRAPH_ERROR.RATE_LIMITED || this.code === GRAPH_ERROR.PAGE_RATE_LIMITED;
  }
}

interface GraphErrorBody {
  error?: { message: string; code: number; error_subcode?: number; type?: string };
}

/** Single place every Graph call goes through, so errors are shaped once. */
async function graphRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; params?: Record<string, string>; body?: URLSearchParams } = {},
): Promise<T> {
  const { method = 'GET', params, body } = options;
  const url = new URL(path.startsWith('http') ? path : `${GRAPH_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

  const response = await fetch(url, { method, body });
  const payload = (await response.json()) as T & GraphErrorBody;

  if (payload.error) {
    const { message, code, error_subcode, type } = payload.error;
    throw new GraphApiError(message, code, error_subcode, type);
  }
  if (!response.ok) {
    throw new GraphApiError(`Graph request failed with status ${response.status}`, -1);
  }
  return payload;
}

// --- Authentication -------------------------------------------------------

/**
 * Exchanges a short-lived user token for one valid ~60 days. Page tokens
 * derived from a long-lived user token do not expire while the user stays
 * an admin, which is what makes scheduled publishing possible.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured');
  }
  const data = await graphRequest<{ access_token: string }>('/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: shortLivedToken,
    },
  });
  return data.access_token;
}

/** The Facebook user behind an access token. Recorded so a data-deletion
 *  request naming that user can find everything they authorised. */
export async function getTokenOwner(userAccessToken: string): Promise<{ id: string; name: string }> {
  return graphRequest<{ id: string; name: string }>('/me', {
    params: { access_token: userAccessToken, fields: 'id,name' },
  });
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
  category?: string;
  pictureUrl?: string;
}

/** Every page the user administers. The tenant chooses which to connect. */
export async function listManagedPages(userAccessToken: string): Promise<ManagedPage[]> {
  const data = await graphRequest<{
    data: {
      id: string;
      name: string;
      access_token: string;
      category?: string;
      picture?: { data?: { url?: string } };
    }[];
  }>('/me/accounts', {
    params: { access_token: userAccessToken, fields: 'id,name,access_token,category,picture', limit: '100' },
  });

  return (data.data ?? []).map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    category: page.category,
    pictureUrl: page.picture?.data?.url,
  }));
}

export interface LinkedInstagramAccount {
  id: string;
  username: string;
  profilePictureUrl?: string;
}

/** The IG Business account linked to a page, if the user linked one. */
export async function getLinkedInstagramAccount(
  pageId: string,
  pageAccessToken: string,
): Promise<LinkedInstagramAccount | null> {
  try {
    const data = await graphRequest<{
      instagram_business_account?: { id: string; username: string; profile_picture_url?: string };
    }>(`/${pageId}`, {
      params: {
        access_token: pageAccessToken,
        fields: 'instagram_business_account{id,username,profile_picture_url}',
      },
    });

    const account = data.instagram_business_account;
    if (!account) return null;
    return {
      id: account.id,
      username: account.username,
      profilePictureUrl: account.profile_picture_url,
    };
  } catch (error) {
    // A missing IG link is normal, so this must not fail the whole connection.
    logger.warn({ err: error, pageId }, 'Could not read linked Instagram account');
    return null;
  }
}

// --- Publishing: Facebook -------------------------------------------------

export interface PublishResult {
  externalId: string;
  permalink?: string;
}

/**
 * Publishes a photo by URL. Returns the post id plus the public image URL,
 * which Instagram needs (see `publishInstagramImage`).
 */
export async function publishFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult & { publicImageUrl?: string }> {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    caption,
    url: imageUrl,
  });

  const data = await graphRequest<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
    method: 'POST',
    body: params,
  });

  const postId = data.post_id ?? data.id;
  let publicImageUrl: string | undefined;
  try {
    const details = await graphRequest<{ full_picture?: string; permalink_url?: string }>(
      `/${postId}`,
      { params: { access_token: pageAccessToken, fields: 'full_picture,permalink_url' } },
    );
    publicImageUrl = details.full_picture;
    return { externalId: postId, permalink: details.permalink_url, publicImageUrl };
  } catch (error) {
    logger.warn({ err: error, postId }, 'Published photo but could not read its public URL');
    return { externalId: postId };
  }
}

export async function publishFacebookVideo(
  pageId: string,
  pageAccessToken: string,
  videoUrl: string,
  description: string,
): Promise<PublishResult> {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    file_url: videoUrl,
    description,
  });

  const data = await graphRequest<{ id: string }>(`/${pageId}/videos`, {
    method: 'POST',
    body: params,
  });
  return { externalId: data.id };
}

// --- Publishing: Instagram ------------------------------------------------

/** Instagram captions are capped at 2,200 characters including hashtags. */
export const IG_CAPTION_LIMIT = 2200;

export function truncateInstagramCaption(body: string, hashtags: string): string {
  const full = `${body}\n\n${hashtags}`.trim();
  if (full.length <= IG_CAPTION_LIMIT) return full;

  // Preserve the hashtags — they drive reach — and trim the body instead.
  const room = IG_CAPTION_LIMIT - hashtags.length - 5;
  if (room <= 0) return hashtags.slice(0, IG_CAPTION_LIMIT - 3) + '...';
  return `${body.slice(0, room)}...\n\n${hashtags}`.trim();
}

/**
 * Instagram publishing is two-phase: create a container, then publish it.
 * Video containers are processed asynchronously and must be polled first.
 */
async function createInstagramContainer(
  igUserId: string,
  pageAccessToken: string,
  fields: Record<string, string>,
): Promise<string> {
  const params = new URLSearchParams({ access_token: pageAccessToken, ...fields });
  const data = await graphRequest<{ id: string }>(`/${igUserId}/media`, {
    method: 'POST',
    body: params,
  });
  return data.id;
}

async function publishInstagramContainer(
  igUserId: string,
  pageAccessToken: string,
  creationId: string,
): Promise<PublishResult> {
  const params = new URLSearchParams({ access_token: pageAccessToken, creation_id: creationId });
  const data = await graphRequest<{ id: string }>(`/${igUserId}/media_publish`, {
    method: 'POST',
    body: params,
  });
  return { externalId: data.id };
}

/**
 * Waits for a video container to finish transcoding.
 *
 * Runs on the worker, never in a request handler — this routinely takes a
 * minute or more, which is exactly what broke the previous serverless design.
 */
async function waitForContainer(
  creationId: string,
  pageAccessToken: string,
  { maxAttempts = 30, intervalMs = 4000 } = {},
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await graphRequest<{ status_code?: string; status?: string }>(`/${creationId}`, {
      params: { access_token: pageAccessToken, fields: 'status_code,status' },
    });

    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') {
      throw new Error(data.status || 'Instagram could not process this video');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Instagram is still processing this video after ${(maxAttempts * intervalMs) / 1000}s`,
  );
}

/**
 * Publishes an image to Instagram.
 *
 * The image must be at a publicly reachable URL — Instagram fetches it itself
 * rather than accepting an upload.
 */
export async function publishInstagramImage(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const creationId = await createInstagramContainer(igUserId, pageAccessToken, {
    image_url: imageUrl,
    caption,
  });
  return publishInstagramContainer(igUserId, pageAccessToken, creationId);
}

/** Publishes a Reel. `shareToFeed` also places it on the profile grid. */
export async function publishInstagramReel(
  igUserId: string,
  pageAccessToken: string,
  videoUrl: string,
  caption: string,
  shareToFeed = true,
): Promise<PublishResult> {
  const creationId = await createInstagramContainer(igUserId, pageAccessToken, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: String(shareToFeed),
  });
  await waitForContainer(creationId, pageAccessToken);
  return publishInstagramContainer(igUserId, pageAccessToken, creationId);
}

// --- Metrics --------------------------------------------------------------

export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  reach: number;
}

const EMPTY_METRICS: EngagementMetrics = { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 };

export async function getFacebookPostMetrics(
  postId: string,
  pageAccessToken: string,
): Promise<EngagementMetrics | null> {
  try {
    const data = await graphRequest<{
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }>(`/${postId}`, {
      params: {
        access_token: pageAccessToken,
        fields: 'likes.summary(true),comments.summary(true),shares',
      },
    });

    return {
      ...EMPTY_METRICS,
      likes: data.likes?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
      shares: data.shares?.count ?? 0,
    };
  } catch (error) {
    // A deleted post is a fact about the world, not a failure to report.
    if (error instanceof GraphApiError && error.isMissingObject) return null;
    throw error;
  }
}

export async function getInstagramPostMetrics(
  mediaId: string,
  pageAccessToken: string,
): Promise<EngagementMetrics | null> {
  try {
    const data = await graphRequest<{ like_count?: number; comments_count?: number }>(
      `/${mediaId}`,
      { params: { access_token: pageAccessToken, fields: 'like_count,comments_count' } },
    );
    return {
      ...EMPTY_METRICS,
      likes: data.like_count ?? 0,
      comments: data.comments_count ?? 0,
    };
  } catch (error) {
    if (error instanceof GraphApiError && error.isMissingObject) return null;
    throw error;
  }
}

// --- Comments -------------------------------------------------------------

export interface NormalisedComment {
  id: string;
  message: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

/**
 * Reads comments from either platform and returns one shape.
 * Instagram uses `text`/`timestamp`/`username` where Facebook uses
 * `message`/`created_time`/`name`, so the difference is absorbed here.
 */
export async function listComments(
  objectId: string,
  pageAccessToken: string,
  platform: 'facebook' | 'instagram',
): Promise<NormalisedComment[]> {
  const fields =
    platform === 'instagram'
      ? 'id,text,from{id,username},timestamp'
      : 'id,message,from{id,name},created_time';

  const data = await graphRequest<{
    data?: {
      id: string;
      message?: string;
      text?: string;
      created_time?: string;
      timestamp?: string;
      from?: { id?: string; name?: string; username?: string };
    }[];
  }>(`/${objectId}/comments`, {
    params: { access_token: pageAccessToken, fields, limit: '100' },
  });

  return (data.data ?? []).map((comment) => ({
    id: comment.id,
    message: comment.message ?? comment.text ?? '',
    authorId: comment.from?.id ?? '',
    authorName: comment.from?.name ?? comment.from?.username ?? 'Unknown',
    createdAt: comment.created_time ?? comment.timestamp ?? new Date().toISOString(),
  }));
}

export async function replyToComment(
  commentId: string,
  pageAccessToken: string,
  message: string,
): Promise<string> {
  const params = new URLSearchParams({ access_token: pageAccessToken, message });
  const data = await graphRequest<{ id: string }>(`/${commentId}/replies`, {
    method: 'POST',
    body: params,
  });
  return data.id;
}

// --- Deletion -------------------------------------------------------------

/**
 * Deletes a Facebook post. Instagram has no delete endpoint for published
 * media, so callers must surface that to the user rather than retrying.
 */
export async function deleteFacebookPost(
  postId: string,
  pageAccessToken: string,
): Promise<boolean> {
  try {
    await graphRequest<{ success?: boolean }>(`/${postId}`, {
      method: 'DELETE',
      params: { access_token: pageAccessToken },
    });
    return true;
  } catch (error) {
    // Already gone is the outcome the caller wanted.
    if (error instanceof GraphApiError && error.isMissingObject) return true;
    throw error;
  }
}

export const INSTAGRAM_DELETE_UNSUPPORTED =
  'Instagram does not allow deleting published posts through its API. Please remove it in the Instagram app.';
