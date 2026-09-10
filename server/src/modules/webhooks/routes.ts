import { Router, urlencoded } from 'express';
import { asyncHandler } from '../../http/middleware.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { parseSignedRequest } from '../../integrations/meta-signed-request.js';
import * as metaWebhooks from './meta-service.js';

export const webhooksRouter: Router = Router();

/** Meta posts these as form-encoded, not JSON. */
webhooksRouter.use(urlencoded({ extended: false }));

/**
 * Deauthorize callback: the client removed the app on Facebook.
 *
 * Always answers 200. Meta retries on failure, and an unverifiable payload is
 * not something a retry can fix.
 */
webhooksRouter.post(
  '/meta/deauthorize',
  asyncHandler(async (req, res) => {
    const payload = parseSignedRequest(String(req.body.signed_request ?? ''));
    if (!payload) {
      logger.warn('Rejected Meta deauthorize callback with an invalid signature');
      return res.status(200).json({ received: true });
    }
    await metaWebhooks.handleDeauthorize(payload.user_id);
    res.status(200).json({ received: true });
  }),
);

/**
 * Data deletion callback.
 *
 * Meta requires the response to carry a status URL and a confirmation code the
 * user can quote back.
 */
webhooksRouter.post(
  '/meta/data-deletion',
  asyncHandler(async (req, res) => {
    const payload = parseSignedRequest(String(req.body.signed_request ?? ''));
    if (!payload) {
      logger.warn('Rejected Meta data-deletion callback with an invalid signature');
      return res.status(400).json({ error: 'Invalid signed request' });
    }

    const { confirmationCode } = await metaWebhooks.handleDataDeletion(payload.user_id);
    res.status(200).json({
      url: `${env.APP_URL}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  }),
);

/** Status page backing the URL returned above. */
webhooksRouter.get(
  '/meta/data-deletion/:code',
  asyncHandler(async (req, res) => {
    const request = await metaWebhooks.getDeletionStatus(String(req.params.code));
    if (!request) return res.status(404).json({ status: 'not_found' });

    res.json({
      status: request.status,
      requestedAt: request.createdAt,
      completedAt: request.completedAt,
      connectionsDeleted: request.connectionsDeleted,
    });
  }),
);
