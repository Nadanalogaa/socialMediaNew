import { Router } from 'express';
import { z } from 'zod';
import { connectMetaSchema, idParamSchema } from '@socialboost/shared';
import {
  asyncHandler,
  requireAuth,
  requireRole,
  validate,
  withOrganization,
} from '../../http/middleware.js';
import { badRequest } from '../../lib/errors.js';
import * as connectionsService from './service.js';

const completeSchema = z.object({
  handle: z.string().uuid(),
  pageIds: z.array(z.string().min(1).max(64)).min(1).max(25),
});

export const connectionsRouter: Router = Router();

connectionsRouter.use(requireAuth, withOrganization);

connectionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ connections: await connectionsService.listConnections(req.tenant!.organizationId) });
  }),
);

/** Step 1: exchange the SDK token and list the user's pages to choose from. */
connectionsRouter.post(
  '/meta/begin',
  requireRole('owner', 'admin'),
  validate(connectMetaSchema),
  asyncHandler(async (req, res) => {
    const result = await connectionsService.beginMetaConnection(
      req.tenant!.organizationId,
      req.body.userAccessToken,
    );
    res.json(result);
  }),
);

/** Step 2: persist the pages the user chose, plus their linked IG accounts. */
connectionsRouter.post(
  '/meta/complete',
  requireRole('owner', 'admin'),
  validate(completeSchema),
  asyncHandler(async (req, res) => {
    const result = await connectionsService.completeMetaConnection(
      req.tenant!.organizationId,
      req.body.handle,
      req.body.pageIds,
    );
    res.status(201).json(result);
  }),
);

connectionsRouter.delete(
  '/:id',
  requireRole('owner', 'admin'),
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw badRequest('Connection id is required');
    await connectionsService.disconnect(req.tenant!.organizationId, req.params.id);
    res.status(204).end();
  }),
);
