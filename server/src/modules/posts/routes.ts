import { Router } from 'express';
import type { PaginationInput } from '@socialboost/shared';
import {
  createPostSchema,
  dateRangeSchema,
  hashtagGroupSchema,
  idParamSchema,
  paginationSchema,
  reviewSchema,
  updatePostSchema,
} from '@socialboost/shared';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { forbidden } from '../../lib/errors.js';
import { bestTimes, nextFreeSlots } from './scheduling.js';
import {
  asyncHandler,
  requireAuth,
  requireRole,
  validate,
  withOrganization,
} from '../../http/middleware.js';
import type { NextFunction, Request, Response } from 'express';
import { badRequest } from '../../lib/errors.js';
import * as postsService from './service.js';

export const postsRouter: Router = Router();

postsRouter.use(requireAuth, withOrganization);

/** Who may write. Viewers (clients) only look and approve. */
const canEdit = requireRole('owner', 'admin', 'member');

/**
 * Who may publish. Owners and admins always; a member only while the
 * workspace does not require approval. Viewers never.
 */
async function canPublish(req: Request, _res: Response, next: NextFunction) {
  const role = req.tenant!.role;
  if (role === 'owner' || role === 'admin') return next();
  if (role === 'member') {
    const [org] = await db
      .select({ requireApproval: organizations.requireApproval })
      .from(organizations)
      .where(eq(organizations.id, req.tenant!.organizationId))
      .limit(1);
    if (!org?.requireApproval) return next();
    return next(forbidden('Posts need approval in this workspace. Submit it for approval instead.'));
  }
  next(forbidden('Your role can view and approve posts, not publish them.'));
}

/** Owners, admins, and clients (viewers) approve; members do not approve their own work. */
const canApprove = requireRole('owner', 'admin', 'viewer');

postsRouter.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    // `validate` has already replaced req.query with the parsed, coerced value.
    const { limit } = req.query as unknown as PaginationInput;
    const posts = await postsService.listPosts(req.tenant!.organizationId, { limit });
    res.json({ posts });
  }),
);

/** Everything with a date inside the range, for the calendar. */
postsRouter.get(
  '/calendar',
  validate(dateRangeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as { from: Date; to: Date };
    const posts = await postsService.listPosts(req.tenant!.organizationId, { from, to });
    res.json({ posts });
  }),
);

postsRouter.get(
  '/best-times',
  asyncHandler(async (req, res) => {
    res.json(await bestTimes(req.tenant!.organizationId));
  }),
);

postsRouter.get(
  '/next-slots',
  asyncHandler(async (req, res) => {
    const count = Math.min(10, Math.max(1, Number(req.query.count) || 5));
    res.json({ slots: await nextFreeSlots(req.tenant!.organizationId, count) });
  }),
);

// --- Hashtag groups (before /:id so the path is not read as an id) ----------

postsRouter.get(
  '/hashtag-groups',
  asyncHandler(async (req, res) => {
    res.json({ groups: await postsService.listHashtagGroups(req.tenant!.organizationId) });
  }),
);

postsRouter.post(
  '/hashtag-groups',
  validate(hashtagGroupSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await postsService.saveHashtagGroup(req.tenant!.organizationId, req.body));
  }),
);

postsRouter.delete(
  '/hashtag-groups/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await postsService.deleteHashtagGroup(req.tenant!.organizationId, String(req.params.id));
    res.status(204).end();
  }),
);

postsRouter.post(
  '/',
  canEdit,
  validate(createPostSchema),
  asyncHandler(async (req, res) => {
    // Publishing straight away is gated like /publish; a draft is not.
    if (!req.body.asDraft) {
      await new Promise<void>((resolve, reject) => canPublish(req, res, (err?: unknown) => (err ? reject(err) : resolve())));
    }
    const post = await postsService.createPost(
      req.tenant!.organizationId,
      req.auth!.userId,
      req.body,
    );
    res.status(201).json(post);
  }),
);

/** Publishes a saved draft, or schedules it. */
postsRouter.post(
  '/:id/publish',
  validate(idParamSchema, 'params'),
  canPublish,
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    const scheduledAt =
      typeof req.body?.scheduledAt === 'string' ? new Date(req.body.scheduledAt) : undefined;
    const post = await postsService.dispatch(
      req.tenant!.organizationId,
      req.params.id,
      scheduledAt,
    );
    res.json(post);
  }),
);

postsRouter.patch(
  '/:id',
  canEdit,
  validate(idParamSchema, 'params'),
  validate(updatePostSchema),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    // Scheduling is publishing with a delay, so it is gated the same way.
    if (req.body.scheduledAt) {
      await new Promise<void>((resolve, reject) => canPublish(req, res, (err?: unknown) => (err ? reject(err) : resolve())));
    }
    res.json(await postsService.updatePost(req.tenant!.organizationId, req.params.id, req.body));
  }),
);

postsRouter.post(
  '/:id/submit',
  canEdit,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(
      await postsService.submitForApproval(req.tenant!.organizationId, String(req.params.id), req.auth!.userId),
    );
  }),
);

postsRouter.post(
  '/:id/approve',
  canApprove,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await postsService.approve(req.tenant!.organizationId, String(req.params.id), req.auth!.userId));
  }),
);

postsRouter.post(
  '/:id/reject',
  canApprove,
  validate(idParamSchema, 'params'),
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await postsService.reject(req.tenant!.organizationId, String(req.params.id), req.auth!.userId, req.body.note),
    );
  }),
);

postsRouter.post(
  '/:id/duplicate',
  canEdit,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    const post = await postsService.duplicatePost(
      req.tenant!.organizationId,
      req.auth!.userId,
      req.params.id,
    );
    res.status(201).json(post);
  }),
);

postsRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    res.json(await postsService.getPost(req.tenant!.organizationId, req.params.id));
  }),
);

postsRouter.delete(
  '/:id',
  canEdit,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    await postsService.deletePost(req.tenant!.organizationId, req.params.id);
    res.status(204).end();
  }),
);
