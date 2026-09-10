/**
 * Publish processor.
 *
 * Runs on the worker because Instagram video containers routinely take a
 * minute or more to transcode — polling that inside an HTTP request is what
 * made the previous design unable to run on serverless hosts.
 *
 * Each target is attempted independently and its outcome recorded, so a post
 * that reaches Facebook but is rejected by Instagram ends as
 * `partially_failed` with a per-channel reason, rather than as a single opaque
 * failure.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { PostStatus } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { mediaAssets, postMedia, postTargets, posts } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import * as meta from '../../integrations/meta.js';
import { markConnectionError, resolveConnection } from '../../modules/connections/service.js';
import { recordUsage } from '../../modules/usage/service.js';

export interface PublishJobData {
  postId: string;
  organizationId: string;
}

export async function processPublishJob(job: Job<PublishJobData>): Promise<void> {
  const { postId, organizationId } = job.data;

  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) {
    logger.warn({ postId }, 'Publish job for a post that no longer exists');
    return;
  }

  const targets = await db.select().from(postTargets).where(eq(postTargets.postId, postId));
  const media = await db
    .select({
      kind: mediaAssets.kind,
      url: mediaAssets.url,
      position: postMedia.position,
    })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
    .where(eq(postMedia.postId, postId));

  const primaryMedia = media.sort((a, b) => a.position - b.position)[0];
  if (!primaryMedia) {
    await failPost(postId, targets, 'This post has no media attached.');
    return;
  }

  await db.update(posts).set({ status: 'publishing', updatedAt: new Date() }).where(eq(posts.id, postId));

  const hashtags = (post.hashtags ?? []).map((tag) => `#${tag.replace(/^#/, '')}`).join(' ');
  let succeeded = 0;

  for (const target of targets) {
    // A target already published in an earlier attempt must not post twice.
    if (target.status === 'published') {
      succeeded++;
      continue;
    }

    try {
      await db
        .update(postTargets)
        .set({ status: 'publishing', updatedAt: new Date() })
        .where(eq(postTargets.id, target.id));

      const connection = await resolveConnection(organizationId, target.connectionId);
      const body = target.caption ?? post.caption;
      const result = await publishToProvider(connection, body, hashtags, primaryMedia);

      await db
        .update(postTargets)
        .set({
          status: 'published',
          externalPostId: result.externalId,
          permalink: result.permalink ?? null,
          publishedAt: new Date(),
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(postTargets.id, target.id));

      // Metered only on success, so a failed attempt costs the customer nothing.
      await recordUsage(organizationId, 'post_publish', 1, {
        provider: connection.provider,
        postId,
      });
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, postId, targetId: target.id }, 'Target publish failed');

      // An expired token needs the user to reconnect; flag the connection so
      // the UI can say so instead of failing every future post silently.
      if (error instanceof meta.GraphApiError && error.isAuthError) {
        await markConnectionError(target.connectionId, message, true);
      }

      await db
        .update(postTargets)
        .set({ status: 'failed', error: message, updatedAt: new Date() })
        .where(eq(postTargets.id, target.id));
    }
  }

  const status: PostStatus =
    succeeded === targets.length ? 'published' : succeeded === 0 ? 'failed' : 'partially_failed';

  await db
    .update(posts)
    .set({
      status,
      publishedAt: succeeded > 0 ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));

  logger.info({ postId, status, succeeded, total: targets.length }, 'Publish job finished');
}

type ResolvedConnection = Awaited<ReturnType<typeof resolveConnection>>;

async function publishToProvider(
  connection: ResolvedConnection,
  body: string,
  hashtags: string,
  media: { kind: string; url: string },
): Promise<meta.PublishResult> {
  switch (connection.provider) {
    case 'facebook_page': {
      const caption = `${body}\n\n${hashtags}`.trim();
      return media.kind === 'video'
        ? meta.publishFacebookVideo(connection.externalId, connection.accessToken, media.url, caption)
        : meta.publishFacebookPhoto(connection.externalId, connection.accessToken, media.url, caption);
    }

    case 'instagram_business': {
      const caption = meta.truncateInstagramCaption(body, hashtags);
      // Media already sits at a public Cloudinary URL, so Instagram fetches it
      // directly. The old app had to publish to Facebook first and reuse that
      // photo's URL, which forced users to post to both.
      return media.kind === 'video'
        ? meta.publishInstagramReel(connection.externalId, connection.accessToken, media.url, caption)
        : meta.publishInstagramImage(connection.externalId, connection.accessToken, media.url, caption);
    }

    case 'youtube_channel':
      throw new Error('YouTube publishing is not enabled yet.');

    default:
      throw new Error(`${connection.provider} cannot be published to.`);
  }
}

async function failPost(
  postId: string,
  targets: { id: string }[],
  reason: string,
): Promise<void> {
  await db.update(posts).set({ status: 'failed', updatedAt: new Date() }).where(eq(posts.id, postId));
  for (const target of targets) {
    await db
      .update(postTargets)
      .set({ status: 'failed', error: reason, updatedAt: new Date() })
      .where(eq(postTargets.id, target.id));
  }
}
