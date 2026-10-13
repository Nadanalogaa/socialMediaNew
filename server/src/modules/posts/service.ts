/**
 * Composing and scheduling posts.
 *
 * A post is authored once and fanned out to many channels. Each channel is a
 * `post_target` row that succeeds or fails independently, so one rejected
 * Instagram caption cannot roll back a successful Facebook publish.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CreatePostInput } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { mediaAssets, postMedia, postTargets, posts } from '../../db/schema.js';
import { badRequest, notFound, serviceUnavailable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { enqueue as enqueueJob, publishQueue } from '../../queue/index.js';
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
async function enqueue(organizationId: string, postId: string, delay = 0): Promise<void> {
  try {
    await enqueueJob(publishQueue, 'publish-post', { postId, organizationId }, delay ? { delay } : {});
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

export async function listPosts(organizationId: string, limit = 20) {
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.organizationId, organizationId))
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // One query for all targets rather than one per post.
  const targets = await db
    .select()
    .from(postTargets)
    .where(inArray(postTargets.postId, rows.map((r) => r.id)));

  const byPost = new Map<string, typeof targets>();
  for (const target of targets) {
    const list = byPost.get(target.postId) ?? [];
    list.push(target);
    byPost.set(target.postId, list);
  }

  return rows.map((post) => ({ ...post, targets: byPost.get(post.id) ?? [] }));
}

/** Removes the post from the dashboard. Platform deletion is a separate action. */
export async function deletePost(organizationId: string, postId: string): Promise<void> {
  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.organizationId, organizationId)))
    .returning({ id: posts.id });

  if (deleted.length === 0) throw notFound('Post not found');
}
