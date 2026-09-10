import { Router } from 'express';
import { z } from 'zod';
import { CREATIVE_KINDS } from '@socialboost/shared';
import {
  asyncHandler,
  requireAuth,
  validate,
  withOrganization,
} from '../../http/middleware.js';
import { createUploadSignature } from '../../integrations/cloudinary.js';
import * as mediaService from './service.js';

const registerSchema = z.object({
  kind: z.enum(CREATIVE_KINDS),
  url: z.string().url().max(2000),
  thumbnailUrl: z.string().url().max(2000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  bytes: z.number().int().nonnegative().optional(),
  providerRef: z.string().max(400).optional(),
});

export const mediaRouter: Router = Router();

mediaRouter.use(requireAuth, withOrganization);

/** Client uploads straight to Cloudinary with this; bytes never touch the API. */
mediaRouter.post(
  '/upload-signature',
  asyncHandler(async (req, res) => {
    res.json(createUploadSignature(req.tenant!.organizationId));
  }),
);

mediaRouter.post(
  '/',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const asset = await mediaService.registerMedia(req.tenant!.organizationId, req.body);
    res.status(201).json(asset);
  }),
);

mediaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ media: await mediaService.listMedia(req.tenant!.organizationId) });
  }),
);
