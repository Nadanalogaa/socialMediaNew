/**
 * Composing and scheduling posts.
 *
 * A post is authored once and fanned out to many channels. Each channel is a
 * `post_target` row that succeeds or fails independently, so one rejected
 * Instagram caption cannot roll back a successful Facebook publish.
 */

import { and, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { CreatePostInput, HashtagGroupInput, UpdatePostInput } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { hashtagGroups, mediaAssets, postMedia, postTargets, posts } from '../../db/schema.js';
import { badRequest, conflict, notFound, serviceUnavailable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { enqueue as enqueueJob, publishQueue, removeJob } from '../../queue/index.js';
import { canPublishInline, publishPost } from './publisher.js';
import { resolveConnection } from '../connections/service.js';
import { assertWithinQuota } from '../usage/service.js';

export async function createPost(
  organizationId: string,
  userId: string,
  input: CreatePostInput,
) {
  await assertWithinQuota(organizationId, 'post_publish', input.targets.length);

  // Verify media and connections belong to this tenant before writing anything.
  const assets = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.organizationId, organizationId),
        inArray(mediaAssets.id, input.mediaAssetIds),
      ),
    );

  if (assets.length !== input.mediaAssetIds.length) {
    throw badRequest('One or more media assets were not found.');
  }

  const resolvedTargets = await Promise.all(
    input.targets.map(async (target) => ({
      input: target,
      connection: await resolveConnection(organizationId, target.connectionId),
    })),
  );

  const initialStatus = input.asDraft ? 'draft' : input.scheduledAt ? 'scheduled' : 'publishing';

  const post = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(posts)
      .values({
        organizationId,
        caption: input.caption,
        hashtags: input.hashtags,
        status: initialStatus,
        scheduledAt: input.scheduledAt ?? null,
        firstComment: input.firstComment?.trim() || null,
        repeatEveryDays: input.repeatEveryDays ?? null,
        repeatUntil: input.repeatUntil ?? null,
        createdBy: userId,
      })
      .returning();

    if (!created) throw new Error('Failed to create post');

    await tx.insert(postMedia).values(
      input.mediaAssetIds.map((mediaAssetId, position) => ({
        postId: created.id,
        mediaAssetId,
        position,
      })),
    );

    await tx.insert(postTargets).values(
      resolvedTargets.map(({ input: target, connection }) => ({
        postId: created.id,
        connectionId: connection.id,
        provider: connection.provider,
        caption: target.caption ?? null,
      })),
    );

    return created;
  });

  // A draft is saved and nothing else happens until it is published.
  if (input.asDraft) return getPost(organizationId, post.id);

  return dispatch(organizationId, post.id, input.scheduledAt);
}

/**
 * Sends a saved post on its way.
 *
 * Shared by creation and by publishing an existing draft, so both paths behave
 * identically.
 */
export async function dispatch(
  organizationId: string,
  postId: string,
  scheduledAt?: Date,
) {
  // Confirms the post is this tenant's before anything is published.
  const existing = await getPost(organizationId, postId);
  if (existing.status === 'published') {
    throw badRequest('This post has already been published.');
  }

  // A post rescheduled or published early must not also fire at its old time.
  if (existing.status === 'scheduled') await forgetJob(postId);

  if (scheduledAt) {
    // BullMQ's delay handles scheduling, so there is no separate cron sweep.
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    await db
      .update(posts)
      .set({ status: 'scheduled', scheduledAt, updatedAt: new Date() })
      .where(eq(posts.id, postId));
    await enqueue(organizationId, postId, delay);
    return getPost(organizationId, postId);
  }

  /*
   * An image post takes a couple of seconds, so it publishes here and the
   * caller gets the real outcome. Video cannot: Instagram needs roughly ninety
   * seconds of polling while it transcodes, which outlives any request, so it
   * goes to the queue and waits for a worker.
   */
  if (await canPublishInline(postId)) {
    try {
      await publishPost(postId, organizationId);
      return getPost(organizationId, postId);
    } catch (error) {
      // Falling through to the queue means a transient failure still gets
      // retried rather than leaving the post stuck as `publishing`.
      logger.warn({ err: error, postId }, 'Inline publish failed; queueing instead');
    }
  }

  await enqueue(organizationId, postId);
  return getPost(organizationId, postId);
}

/**
 * Queues the publish job.
 *
 * If the queue cannot be reached the post is returned to draft rather than
 * left as `publishing`, which nothing would ever resolve, and the real reason
 * is reported instead of a generic failure.
 */
/** One job per post, so it can be found and removed when plans change. */
export const publishJobId = (postId: string) => `post:${postId}`;

async function forgetJob(postId: string): Promise<void> {
  try {
    await removeJob(publishQueue, publishJobId(postId));
  } catch (error) {
    logger.warn({ err: error, postId }, 'Could not remove the old publish job');
  }
}

async function enqueue(organizationId: string, postId: string, delay = 0): Promise<void> {
  try {
    await enqueueJob(
      publishQueue,
      'publish-post',
      { postId, organizationId },
      { jobId: publishJobId(postId), ...(delay ? { delay } : {}) },
    );
    if (!delay) {
      await db
        .update(posts)
        .set({ status: 'publishing', updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, postId }, 'Could not queue the publish job');

    await db
      .update(posts)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(posts.id, postId));

    throw serviceUnavailable(
      `This post was saved as a draft but could not be queued for publishing: ${reason}`,
    );
  }
}

export async function getPost(organizationId: string, postId: string) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.organizationId, organizationId)))
    .limit(1);

  if (!post) throw notFound('Post not found');

  const targets = await db
    .select()
    .from(postTargets)
    .where(eq(postTargets.postId, postId));

  const media = await db
    .select({
      id: mediaAssets.id,
      kind: mediaAssets.kind,
      url: mediaAssets.url,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      position: postMedia.position,
    })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
    .where(eq(postMedia.postId, postId));

  return { ...post, targets, media: media.sort((a, b) => a.position - b.position) };
}

export interface ListPostsOptions {
  limit?: number;
  /** Posts whose date (scheduled, else published, else created) falls in the range. */
  from?: Date;
  to?: Date;
}

/** The date a post belongs to on a calendar. */
const postDate = sql`coalesce(${posts.scheduledAt}, ${posts.publishedAt}, ${posts.createdAt})`;

export async function listPosts(organizationId: string, options: ListPostsOptions = {}) {
  const { limit = 20, from, to } = options;
  const conditions = [eq(posts.organizationId, organizationId)];
  // Bound as text: a raw expression gives the driver no type to serialise a Date with.
  if (from) conditions.push(gte(postDate, sql`${from.toISOString()}::timestamptz`));
  if (to) conditions.push(lte(postDate, sql`${to.toISOString()}::timestamptz`));

  const rows = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(from || to ? postDate : desc(posts.createdAt))
    .limit(from || to ? 500 : limit);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // One query for all targets rather than one per post.
  const targets = await db.select().from(postTargets).where(inArray(postTargets.postId, ids));
  const byPost = new Map<string, typeof targets>();
  for (const target of targets) {
    const list = byPost.get(target.postId) ?? [];
    list.push(target);
    byPost.set(target.postId, list);
  }

  // The first picture, for the calendar chip and the list card.
  const media = await db
    .select({
      postId: postMedia.postId,
      id: mediaAssets.id,
      kind: mediaAssets.kind,
      url: mediaAssets.url,
      thumbnailUrl: mediaAssets.thumbnailUrl,
    })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
    .where(and(inArray(postMedia.postId, ids), eq(postMedia.position, 0)));
  const mediaByPost = new Map(media.map((m) => [m.postId, m]));

  return rows.map((post) => ({
    ...post,
    targets: byPost.get(post.id) ?? [],
    media: mediaByPost.has(post.id) ? [mediaByPost.get(post.id)!] : [],
  }));
}

const EDITABLE: string[] = ['draft', 'pending_approval', 'scheduled', 'failed', 'partially_failed'];

/**
 * Edits a post that has not gone out.
 *
 * Targets and media are replaced whole when given. A new `scheduledAt` moves
 * the queued job; `null` cancels it and the post returns to being a draft.
 */
export async function updatePost(organizationId: string, postId: string, input: UpdatePostInput) {
  const existing = await getPost(organizationId, postId);
  if (!EDITABLE.includes(existing.status)) {
    throw conflict('A published post cannot be edited. Duplicate it to post again.');
  }

  if (input.mediaAssetIds) {
    const assets = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.organizationId, organizationId), inArray(mediaAssets.id, input.mediaAssetIds)),
      );
    if (assets.length !== input.mediaAssetIds.length) {
      throw badRequest('One or more media assets were not found.');
    }
  }

  const resolvedTargets = input.targets
    ? await Promise.all(
        input.targets.map(async (target) => ({
          input: target,
          connection: await resolveConnection(organizationId, target.connectionId),
        })),
      )
    : null;

  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        ...(input.caption !== undefined ? { caption: input.caption } : {}),
        ...(input.hashtags !== undefined ? { hashtags: input.hashtags } : {}),
        ...(input.firstComment !== undefined ? { firstComment: input.firstComment?.trim() || null } : {}),
        ...(input.repeatEveryDays !== undefined ? { repeatEveryDays: input.repeatEveryDays } : {}),
        ...(input.repeatUntil !== undefined ? { repeatUntil: input.repeatUntil } : {}),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    if (input.mediaAssetIds) {
      await tx.delete(postMedia).where(eq(postMedia.postId, postId));
      await tx.insert(postMedia).values(
        input.mediaAssetIds.map((mediaAssetId, position) => ({ postId, mediaAssetId, position })),
      );
    }

    if (resolvedTargets) {
      // Keep a target's per-channel caption where the channel stays.
      await tx.delete(postTargets).where(eq(postTargets.postId, postId));
      await tx.insert(postTargets).values(
        resolvedTargets.map(({ input: target, connection }) => ({
          postId,
          connectionId: connection.id,
          provider: connection.provider,
          caption: target.caption ?? null,
        })),
      );
    }
  });

  if (input.scheduledAt === null) {
    if (existing.status === 'scheduled') {
      await forgetJob(postId);
      await db
        .update(posts)
        .set({ status: 'draft', scheduledAt: null, updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }
  } else if (input.scheduledAt) {
    if (input.scheduledAt.getTime() <= Date.now()) {
      throw badRequest('The scheduled time must be in the future.');
    }
    return dispatch(organizationId, postId, input.scheduledAt);
  }

  return getPost(organizationId, postId);
}

// --- Approval -------------------------------------------------------------------

/** A member hands a draft to whoever can publish it. */
export async function submitForApproval(organizationId: string, postId: string, userId: string) {
  const post = await getPost(organizationId, postId);
  if (!['draft', 'failed', 'partially_failed'].includes(post.status)) {
    throw conflict('Only a draft can be submitted for approval.');
  }
  await db
    .update(posts)
    .set({ status: 'pending_approval', submittedBy: userId, reviewNote: null, updatedAt: new Date() })
    .where(eq(posts.id, postId));
  return getPost(organizationId, postId);
}

/** Approval publishes now, or schedules if the post carries a future time. */
export async function approve(organizationId: string, postId: string, userId: string) {
  const post = await getPost(organizationId, postId);
  if (post.status !== 'pending_approval') throw conflict('This post is not waiting for approval.');
  await db
    .update(posts)
    .set({ reviewedBy: userId, reviewNote: null, updatedAt: new Date() })
    .where(eq(posts.id, postId));
  const when = post.scheduledAt && post.scheduledAt.getTime() > Date.now() ? post.scheduledAt : undefined;
  return dispatch(organizationId, postId, when);
}

export async function reject(organizationId: string, postId: string, userId: string, note?: string) {
  const post = await getPost(organizationId, postId);
  if (post.status !== 'pending_approval') throw conflict('This post is not waiting for approval.');
  await db
    .update(posts)
    .set({ status: 'draft', reviewedBy: userId, reviewNote: note?.trim() || null, updatedAt: new Date() })
    .where(eq(posts.id, postId));
  return getPost(organizationId, postId);
}

/** A fresh draft with the same content, channels and first comment. */
export async function duplicatePost(organizationId: string, userId: string, postId: string) {
  const source = await getPost(organizationId, postId);

  const copy = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(posts)
      .values({
        organizationId,
        caption: source.caption,
        hashtags: source.hashtags,
        status: 'draft',
        firstComment: source.firstComment,
        createdBy: userId,
      })
      .returning();
    if (!created) throw new Error('Failed to duplicate post');

    if (source.media.length > 0) {
      await tx.insert(postMedia).values(
        source.media.map((m, position) => ({ postId: created.id, mediaAssetId: m.id, position })),
      );
    }
    if (source.targets.length > 0) {
      await tx.insert(postTargets).values(
        source.targets.map((t) => ({
          postId: created.id,
          connectionId: t.connectionId,
          provider: t.provider,
          caption: t.caption,
        })),
      );
    }
    return created;
  });

  return getPost(organizationId, copy.id);
}

// --- Hashtag groups -----------------------------------------------------------

export async function listHashtagGroups(organizationId: string) {
  return db
    .select()
    .from(hashtagGroups)
    .where(eq(hashtagGroups.organizationId, organizationId))
    .orderBy(hashtagGroups.name);
}

export async function saveHashtagGroup(organizationId: string, input: HashtagGroupInput) {
  const tags = [...new Set(input.tags.map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean))];
  const [saved] = await db
    .insert(hashtagGroups)
    .values({ organizationId, name: input.name.trim(), tags })
    .onConflictDoUpdate({
      target: [hashtagGroups.organizationId, hashtagGroups.name],
      set: { tags, updatedAt: new Date() },
    })
    .returning();
  return saved!;
}

export async function deleteHashtagGroup(organizationId: string, id: string): Promise<void> {
  await db
    .delete(hashtagGroups)
    .where(and(eq(hashtagGroups.id, id), eq(hashtagGroups.organizationId, organizationId)));
}

void or;

/** Removes the post from the dashboard. Platform deletion is a separate action. */
export async function deletePost(organizationId: string, postId: string): Promise<void> {
  await forgetJob(postId);
  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.organizationId, organizationId)))
    .returning({ id: posts.id });

  if (deleted.length === 0) throw notFound('Post not found');
}
