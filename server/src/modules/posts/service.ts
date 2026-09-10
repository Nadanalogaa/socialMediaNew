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
import { badRequest, notFound } from '../../lib/errors.js';
import { publishQueue } from '../../queue/index.js';
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

  const post = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(posts)
      .values({
        organizationId,
        caption: input.caption,
        hashtags: input.hashtags,
        status: input.scheduledAt ? 'scheduled' : 'publishing',
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

  // BullMQ's delay handles scheduling, so there is no separate cron sweep.
  const delay = input.scheduledAt ? Math.max(0, input.scheduledAt.getTime() - Date.now()) : 0;
  await publishQueue.add('publish-post', { postId: post.id, organizationId }, { delay });

  return getPost(organizationId, post.id);
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
