import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireRole, validate, withOrganization } from '../../http/middleware.js';
import { features } from '../../lib/env.js';
import * as service from './service.js';

export const googleRouter: Router = Router();

googleRouter.use(requireAuth, withOrganization);

googleRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json({ configured: features.google, ...(await service.overview(req.tenant!.organizationId)) });
  }),
);

const replySchema = z.object({
  connectionId: z.string().uuid(),
  reviewName: z.string().min(1).max(300),
  comment: z.string().min(1).max(4000),
});

googleRouter.post(
  '/reviews/reply',
  requireRole('owner', 'admin', 'member'),
  validate(replySchema),
  asyncHandler(async (req, res) => {
    const { connectionId, reviewName, comment } = req.body as z.infer<typeof replySchema>;
    await service.reply(req.tenant!.organizationId, connectionId, reviewName, comment);
    res.status(201).json({ ok: true });
  }),
);
