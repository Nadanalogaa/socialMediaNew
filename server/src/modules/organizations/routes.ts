import { Router } from 'express';
import { z } from 'zod';
import {
  brandKitSchema,
  idParamSchema,
  inviteSchema,
  memberRoleSchema,
  organizationSettingsSchema,
} from '@socialboost/shared';
import { env } from '../../lib/env.js';
import {
  asyncHandler,
  requireAuth,
  requireRole,
  validate,
  withOrganization,
} from '../../http/middleware.js';
import * as organizationsService from './service.js';

const nameSchema = z.object({ name: z.string().min(1).max(120) });
const renameSchema = nameSchema.extend({ organizationId: z.string().uuid() });

export const organizationsRouter: Router = Router();

/** What an invitation link leads to — readable before signing in. */
organizationsRouter.get(
  '/invitations/:token',
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.describeInvitation(String(req.params.token)));
  }),
);

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
  requireRole('owner', 'admin'),
  validate(organizationSettingsSchema),
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.updateSettings(req.tenant!.organizationId, req.body));
  }),
);

organizationsRouter.get(
  '/current/brand',
  withOrganization,
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.getBrand(req.tenant!.organizationId));
  }),
);

organizationsRouter.patch(
  '/current/brand',
  withOrganization,
  requireRole('owner', 'admin', 'member'),
  validate(brandKitSchema),
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.updateBrand(req.tenant!.organizationId, req.body));
  }),
);

// --- Team ----------------------------------------------------------------------

const manage = [withOrganization, requireRole('owner', 'admin')] as const;

organizationsRouter.get(
  '/current/members',
  withOrganization,
  asyncHandler(async (req, res) => {
    res.json({ members: await organizationsService.listMembers(req.tenant!.organizationId) });
  }),
);

organizationsRouter.patch(
  '/current/members/:id',
  ...manage,
  validate(idParamSchema, 'params'),
  validate(memberRoleSchema),
  asyncHandler(async (req, res) => {
    res.json({
      members: await organizationsService.setMemberRole(
        req.tenant!.organizationId,
        String(req.params.id),
        req.body.role,
      ),
    });
  }),
);

organizationsRouter.delete(
  '/current/members/:id',
  ...manage,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({
      members: await organizationsService.removeMember(req.tenant!.organizationId, String(req.params.id)),
    });
  }),
);

const inviteLink = (token: string) => `${env.APP_URL.replace(/\/$/, '')}/invite/${token}`;

organizationsRouter.get(
  '/current/invitations',
  ...manage,
  asyncHandler(async (req, res) => {
    const rows = await organizationsService.listInvitations(req.tenant!.organizationId);
    res.json({ invitations: rows.map((row) => ({ ...row, link: inviteLink(row.token) })) });
  }),
);

organizationsRouter.post(
  '/current/invitations',
  ...manage,
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const invite = await organizationsService.createInvitation(
      req.tenant!.organizationId,
      req.auth!.userId,
      req.body,
    );
    res.status(201).json({ ...invite, link: inviteLink(invite.token) });
  }),
);

organizationsRouter.delete(
  '/current/invitations/:id',
  ...manage,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await organizationsService.deleteInvitation(req.tenant!.organizationId, String(req.params.id));
    res.status(204).end();
  }),
);

organizationsRouter.post(
  '/invitations/:token/accept',
  asyncHandler(async (req, res) => {
    res.json(await organizationsService.acceptInvitation(String(req.params.token), req.auth!.userId));
  }),
);
