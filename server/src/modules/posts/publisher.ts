/**
 * Publishing a post to its channels.
 *
 * Shared by the worker and the inline path: an image post takes a couple of
 * seconds and can run inside the request, while an Instagram video needs
 * roughly ninety seconds of polling while Meta transcodes it and genuinely
 * needs a background worker.
 *
 * Each target succeeds or fails independently, so a post rejected by one
 * platform still reaches the others and records why.
 */

import { eq } from 'drizzle-orm';
import type { PostStatus } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { mediaAssets, postMedia, postTargets, posts } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { enqueue, publishQueue } from '../../queue/index.js';
import * as meta from '../../integrations/meta.js';
import { markConnectionError, resolveConnection } from '../connections/service.js';
import { getGoogleAccessToken } from '../connections/google.js';
import * as google from '../../integrations/google.js';
import { recordUsage } from '../usage/service.js';

export interface PublishOutcome {
  status: PostStatus;
  succeeded: number;
  total: number;
}

/** True when every target can be published quickly enough for a web request. */
export async function canPublishInline(postId: string): Promise<boolean> {
  const media = await db
    .select({ kind: mediaAssets.kind })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
    .where(eq(postMedia.postId, postId));

  // Video means Instagram container polling, which outlives any request.
  return media.length > 0 && media.every((asset) => asset.kind === 'image');
}

export async function publishPost(
  postId: string,
  organizationId: string,
): Promise<PublishOutcome> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) {
    logger.warn({ postId }, 'Publish requested for a post that no longer exists');
    return { status: 'failed', succeeded: 0, total: 0 };
  }

  const targets = await db.select().from(postTargets).where(eq(postTargets.postId, postId));
  const media = await db
    .select({ kind: mediaAssets.kind, url: mediaAssets.url, position: postMedia.position })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
    .where(eq(postMedia.postId, postId));

  const primaryMedia = media.sort((a, b) => a.position - b.position)[0];
  if (!primaryMedia) {
    await failPost(postId, targets, 'This post has no media attached.');
    return { status: 'failed', succeeded: 0, total: targets.length };
  }

  await db
    .update(posts)
    .set({ status: 'publishing', updatedAt: new Date() })
    .where(eq(posts.id, postId));

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
      const result =
        connection.provider === 'google_business'
          ? await publishToGoogle(organizationId, connection, body, primaryMedia)
          : await publishToProvider(connection, body, hashtags, primaryMedia);

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

      // The first comment is a courtesy, not part of the publish: it must
      // never turn a published post into a failed one.
      if (post.firstComment) {
        try {
          const commentId = await meta.createComment(
            result.externalId,
            connection.accessToken,
            post.firstComment,
          );
          await db
            .update(postTargets)
            .set({ firstCommentId: commentId })
            .where(eq(postTargets.id, target.id));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          logger.warn({ err: error, postId, targetId: target.id }, 'First comment failed');
          await db
            .update(postTargets)
            .set({ firstCommentError: reason })
            .where(eq(postTargets.id, target.id));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, postId, targetId: target.id }, 'Target publish failed');

      // An expired token needs the user to reconnect; flag it so the UI can
      // say so rather than failing every future post silently.
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
    .set({ status, publishedAt: succeeded > 0 ? new Date() : null, updatedAt: new Date() })
    .where(eq(posts.id, postId));

  logger.info({ postId, status, succeeded, total: targets.length }, 'Publish finished');

  if (succeeded > 0 && post.repeatEveryDays) {
    await scheduleRepeat(post, targets, media).catch((error) =>
      logger.error({ err: error, postId }, 'Could not schedule the next repeat'),
    );
  }

  return { status, succeeded, total: targets.length };
}

type PostRow = typeof posts.$inferSelect;
type TargetRow = typeof postTargets.$inferSelect;

/**
 * Evergreen posts: a copy is queued for N days on, until the end date.
 *
 * Each repeat is its own post, so the history shows every time it went out
 * and any one occurrence can be edited or cancelled without touching the rest.
 */
async function scheduleRepeat(
  post: PostRow,
  targets: TargetRow[],
  media: { kind: string; url: string; position: number }[],
): Promise<void> {
  const days = post.repeatEveryDays!;
  const base = post.scheduledAt ?? new Date();
  const next = new Date(Math.max(base.getTime(), Date.now()) + days * 86_400_000);
  if (post.repeatUntil && next.getTime() > post.repeatUntil.getTime()) return;

  const mediaRows = await db
    .select({ mediaAssetId: postMedia.mediaAssetId, position: postMedia.position })
    .from(postMedia)
    .where(eq(postMedia.postId, post.id));
  void media;

  const copy = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(posts)
      .values({
        organizationId: post.organizationId,
        caption: post.caption,
        hashtags: post.hashtags,
        status: 'scheduled',
        scheduledAt: next,
        firstComment: post.firstComment,
        repeatEveryDays: post.repeatEveryDays,
        repeatUntil: post.repeatUntil,
        parentPostId: post.parentPostId ?? post.id,
        createdBy: post.createdBy,
      })
      .returning();
    if (!created) throw new Error('Failed to create the repeat');

    if (mediaRows.length > 0) {
      await tx
        .insert(postMedia)
        .values(mediaRows.map((m) => ({ postId: created.id, mediaAssetId: m.mediaAssetId, position: m.position })));
    }
    await tx.insert(postTargets).values(
      targets.map((t) => ({
        postId: created.id,
        connectionId: t.connectionId,
        provider: t.provider,
        caption: t.caption,
      })),
    );
    return created;
  });

  await enqueue(
    publishQueue,
    'publish-post',
    { postId: copy.id, organizationId: post.organizationId },
    { jobId: `post:${copy.id}`, delay: Math.max(0, next.getTime() - Date.now()) },
  );
  logger.info({ postId: post.id, nextPostId: copy.id, next }, 'Repeat scheduled');
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
      // Media sits at a public URL, so Instagram fetches it directly rather
      // than needing a Facebook post to borrow an image URL from.
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

/**
 * A Business Profile update: the caption as the post text, the first image as
 * its photo, and a "Learn more" button to the website when the kit has one.
 * Hashtags are left out — Google ignores them and they look odd on Maps.
 */
async function publishToGoogle(
  organizationId: string,
  connection: ResolvedConnection,
  body: string,
  media: { kind: string; url: string },
): Promise<meta.PublishResult> {
  const accessToken = await getGoogleAccessToken(organizationId, connection.id);
  const website = typeof connection.metadata.website === 'string' ? connection.metadata.website : undefined;
  const created = await google.createLocalPost(accessToken, connection.externalId, {
    summary: body,
    ...(media.kind === 'image' ? { imageUrl: media.url } : {}),
    ...(website ? { callToAction: { type: 'LEARN_MORE', url: website } } : {}),
  });
  return { externalId: created.name, permalink: created.searchUrl ?? undefined };
}

async function failPost(postId: string, targets: { id: string }[], reason: string): Promise<void> {
  await db
    .update(posts)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(posts.id, postId));
  for (const target of targets) {
    await db
      .update(postTargets)
      .set({ status: 'failed', error: reason, updatedAt: new Date() })
      .where(eq(postTargets.id, target.id));
  }
}
