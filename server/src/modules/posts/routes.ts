import { Router } from 'express';
import type { PaginationInput } from '@socialboost/shared';
import {
  createPostSchema,
  dateRangeSchema,
  hashtagGroupSchema,
  idParamSchema,
  paginationSchema,
  updatePostSchema,
} from '@socialboost/shared';
import { bestTimes, nextFreeSlots } from './scheduling.js';
import {
  asyncHandler,
  requireAuth,
  validate,
  withOrganization,
} from '../../http/middleware.js';
import { badRequest } from '../../lib/errors.js';
import * as postsService from './service.js';

export const postsRouter: Router = Router();

postsRouter.use(requireAuth, withOrganization);

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
  validate(createPostSchema),
  asyncHandler(async (req, res) => {
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
  validate(idParamSchema, 'params'),
  validate(updatePostSchema),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    res.json(await postsService.updatePost(req.tenant!.organizationId, req.params.id, req.body));
  }),
);

postsRouter.post(
  '/:id/duplicate',
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
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Post id is required');
    await postsService.deletePost(req.tenant!.organizationId, req.params.id);
    res.status(204).end();
  }),
);
