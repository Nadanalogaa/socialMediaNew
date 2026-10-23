/**
 * The inbox: comments on the posts a workspace published, across its
 * channels, read live from Meta and answered from here.
 *
 * Nothing is stored. Comments are fetched when the screen opens (cached for
 * a minute per workspace so a refresh does not hammer the Graph API), which
 * keeps the data on Meta's side and makes "what has been answered" simply a
 * question of whether the Page replied.
 */

import { Router } from 'express';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { connections, postTargets, posts } from '../../db/schema.js';
import { asyncHandler, requireAuth, requireRole, validate, withOrganization } from '../../http/middleware.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import * as meta from '../../integrations/meta.js';
import * as gemini from '../../integrations/gemini.js';
import { features } from '../../lib/env.js';
import { resolveConnection } from '../connections/service.js';
import { getBrand } from '../organizations/service.js';

export const inboxRouter: Router = Router();

inboxRouter.use(requireAuth, withOrganization);

export interface InboxComment {
  id: string;
  message: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  /** Written by the Page or Instagram account itself — i.e. a reply. */
  fromUs: boolean;
}

export interface InboxThread {
  targetId: string;
  postId: string;
  provider: string;
  channelName: string;
  caption: string;
  permalink: string | null;
  publishedAt: string | null;
  comments: InboxComment[];
  /** The last comment is from someone else and the Page has not answered since. */
  unanswered: boolean;
  error: string | null;
}

const cache = new Map<string, { at: number; threads: InboxThread[] }>();
const CACHE_MS = 60_000;

async function loadThreads(organizationId: string, days: number): Promise<InboxThread[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const targets = await db
    .select({
      id: postTargets.id,
      postId: postTargets.postId,
      connectionId: postTargets.connectionId,
      provider: postTargets.provider,
      externalPostId: postTargets.externalPostId,
      permalink: postTargets.permalink,
      publishedAt: postTargets.publishedAt,
      caption: posts.caption,
      channelName: connections.displayName,
      pageId: connections.externalId,
    })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .innerJoin(connections, eq(connections.id, postTargets.connectionId))
    .where(
      and(
        eq(posts.organizationId, organizationId),
        eq(postTargets.status, 'published'),
        isNotNull(postTargets.externalPostId),
        gte(postTargets.publishedAt, since),
        inArray(postTargets.provider, ['facebook_page', 'instagram_business']),
      ),
    )
    .orderBy(desc(postTargets.publishedAt))
    .limit(40);

  // A handful at a time: the Graph API rate-limits per Page.
  const threads: InboxThread[] = [];
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (t): Promise<InboxThread> => {
        const base = {
          targetId: t.id,
          postId: t.postId,
          provider: t.provider,
          channelName: t.channelName,
          caption: t.caption,
          permalink: t.permalink,
          publishedAt: t.publishedAt?.toISOString() ?? null,
        };
        try {
          const connection = await resolveConnection(organizationId, t.connectionId);
          const raw = await meta.listComments(
            t.externalPostId!,
            connection.accessToken,
            t.provider === 'instagram_business' ? 'instagram' : 'facebook',
          );
          const comments = raw
            .map((c) => ({ ...c, fromUs: c.authorId === t.pageId }))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          const last = comments[comments.length - 1];
          return { ...base, comments, unanswered: Boolean(last && !last.fromUs), error: null };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn({ err: error, targetId: t.id }, 'Could not read comments');
          return { ...base, comments: [], unanswered: false, error: message };
        }
      }),
    );
    threads.push(...results);
  }

  // Busiest conversations first; posts with no comments at the end.
  return threads.sort((a, b) => {
    const la = a.comments[a.comments.length - 1]?.createdAt ?? a.publishedAt ?? '';
    const lb = b.comments[b.comments.length - 1]?.createdAt ?? b.publishedAt ?? '';
    return lb.localeCompare(la);
  });
}

inboxRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const fresh = req.query.refresh === '1';
    const key = `${organizationId}:${days}`;
    const cached = cache.get(key);
    if (!fresh && cached && Date.now() - cached.at < CACHE_MS) {
      return res.json({ threads: cached.threads, cachedAt: new Date(cached.at).toISOString() });
    }
    const threads = await loadThreads(organizationId, days);
    cache.set(key, { at: Date.now(), threads });
    res.json({ threads, cachedAt: new Date().toISOString() });
  }),
);

const replySchema = z.object({
  targetId: z.string().uuid(),
  commentId: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
});

inboxRouter.post(
  '/reply',
  requireRole('owner', 'admin', 'member'),
  validate(replySchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const { targetId, commentId, message } = req.body as z.infer<typeof replySchema>;
    const [target] = await db
      .select({ connectionId: postTargets.connectionId })
      .from(postTargets)
      .innerJoin(posts, eq(posts.id, postTargets.postId))
      .where(and(eq(postTargets.id, targetId), eq(posts.organizationId, organizationId)))
      .limit(1);
    if (!target) throw notFound('Post not found');
    const connection = await resolveConnection(organizationId, target.connectionId);
    try {
      const id = await meta.replyToComment(commentId, connection.accessToken, message.trim());
      // The thread changed; the next read should see the reply.
      for (const key of cache.keys()) if (key.startsWith(`${organizationId}:`)) cache.delete(key);
      res.status(201).json({ id });
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Could not post the reply.');
    }
  }),
);

const suggestSchema = z.object({
  authorName: z.string().max(200),
  message: z.string().max(5000),
  postCaption: z.string().max(5000).default(''),
});

/** A reply drafted in the brand's voice; the person still presses Send. */
inboxRouter.post(
  '/suggest',
  requireRole('owner', 'admin', 'member'),
  validate(suggestSchema),
  asyncHandler(async (req, res) => {
    const brand = await getBrand(req.tenant!.organizationId);
    const context = { name: brand.name, phone: brand.phone, email: brand.email, website: brand.website, industry: brand.industry, description: brand.description, toneOfVoice: brand.toneOfVoice, targetAudience: brand.targetAudience };
    const input = req.body as z.infer<typeof suggestSchema>;
    if (features.ai) {
      try {
        return res.json({ reply: await gemini.suggestCommentReply(context, input), source: 'ai' });
      } catch (error) {
        logger.warn({ err: error }, 'AI comment reply failed; using the template');
      }
    }
    res.json({ reply: gemini.templateCommentReply(context, input), source: 'template' });
  }),
);
