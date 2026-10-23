import { Router } from 'express';
import { asyncHandler, requireAuth, withOrganization } from '../../http/middleware.js';
import { computeNudges } from './service.js';

export const nudgesRouter: Router = Router();

nudgesRouter.use(requireAuth, withOrganization);

nudgesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ nudges: await computeNudges(req.tenant!.organizationId) });
  }),
);
