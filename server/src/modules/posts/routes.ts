import { Router } from 'express';
import type { PaginationInput } from '@socialboost/shared';
import { createPostSchema, idParamSchema, paginationSchema } from '@socialboost/shared';
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
    const posts = await postsService.listPosts(req.tenant!.organizationId, limit);
    res.json({ posts });
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
