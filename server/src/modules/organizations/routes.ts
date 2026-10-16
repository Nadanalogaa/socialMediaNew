import { Router } from 'express';
import { z } from 'zod';
import { organizationSettingsSchema } from '@socialboost/shared';
import { asyncHandler, requireAuth, validate, withOrganization } from '../../http/middleware.js';
import * as organizationsService from './service.js';

const nameSchema = z.object({ name: z.string().min(1).max(120) });
const renameSchema = nameSchema.extend({ organizationId: z.string().uuid() });

export const organizationsRouter: Router = Router();

// Deliberately not behind `withOrganization`: these endpoints are how a client
// discovers and switches between organizations, so they cannot require one.
organizationsRouter.use(requireAuth);

organizationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ organizations: await organizationsService.listForUser(req.auth!.userId) });
  }),
);

organizationsRouter.post(
  '/',
  validate(nameSchema),
  asyncHandler(async (req, res) => {
    const organization = await organizationsService.create(req.auth!.userId, req.body.name);
    res.status(201).json(organization);
  }),
);

organizationsRouter.patch(
  '/',
  validate(renameSchema),
  asyncHandler(async (req, res) => {
    const organization = await organizationsService.rename(
      req.auth!.userId,
      req.body.organizationId,
      req.body.name,
    );
    res.json(organization);
  }),
);

// Scoped to the active organisation, unlike the discovery endpoints above.
organizationsRouter.get(
  '/current/settings',
  withOrganization,
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.getSettings(req.tenant!.organizationId));
  }),
);

organizationsRouter.patch(
  '/current/settings',
  withOrganization,
  validate(organizationSettingsSchema),
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.updateSettings(req.tenant!.organizationId, req.body));
  }),
);
