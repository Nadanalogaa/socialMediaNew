import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireRole, validate, withOrganization } from '../../http/middleware.js';
import { features } from '../../lib/env.js';
import * as service from './service.js';

export const googleRouter: Router = Router();

googleRouter.use(requireAuth, withOrganization);

googleRouter.get(
  '/keywords',
  asyncHandler(async (req, res) => {
    res.json(await service.keywordSuggestions(req.tenant!.organizationId));
  }),
);

googleRouter.get(
  '/competitors/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.competitors(req.tenant!.organizationId, String(req.params.id)));
  }),
);

const suggestSchema = z.object({
  reviewer: z.string().max(200),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000),
});

googleRouter.post(
  '/reviews/suggest',
  requireRole('owner', 'admin', 'member'),
  validate(suggestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.suggestReviewReply(req.tenant!.organizationId, req.body as z.infer<typeof suggestSchema>));
  }),
);

googleRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    // Suggestions always exist (templates at worst), so the button always shows.
    res.json({ configured: features.google, ai: true, aiProvider: features.ai, places: features.places, ...(await service.overview(req.tenant!.organizationId)) });
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
