import { Router } from 'express';
import { startSubscriptionSchema, verifyPaymentSchema } from '@socialboost/shared';
import { asyncHandler, requireAuth, requireRole, validate, withOrganization } from '../../http/middleware.js';
import * as billing from './service.js';

export const billingRouter: Router = Router();

billingRouter.use(requireAuth, withOrganization);

billingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await billing.getBilling(req.tenant!.organizationId));
  }),
);

billingRouter.post(
  '/checkout',
  requireRole('owner', 'admin'),
  validate(startSubscriptionSchema),
  asyncHandler(async (req, res) => {
    res.json(await billing.startCheckout(req.tenant!.organizationId, req.auth!.userId, req.body));
  }),
);

billingRouter.post(
  '/verify',
  requireRole('owner', 'admin'),
  validate(verifyPaymentSchema),
  asyncHandler(async (req, res) => {
    res.json(await billing.confirmCheckout(req.tenant!.organizationId, req.body));
  }),
);
