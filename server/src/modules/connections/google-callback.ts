import { Router } from 'express';
import { asyncHandler } from '../../http/middleware.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import * as googleConnect from './google.js';

/**
 * Google's OAuth redirect target.
 *
 * Unauthenticated by necessity — Google sends the browser here directly. The
 * `state` parameter is what establishes which workspace the grant belongs to,
 * and it is verified against Redis before anything is stored.
 */
export const googleCallbackRouter: Router = Router();

googleCallbackRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const denied = typeof req.query.error === 'string' ? req.query.error : '';

    // Back into the app's Channels screen, which reads these parameters.
    const back = (params: Record<string, string>) =>
      res.redirect(`${env.APP_URL}/app?tab=channels&${new URLSearchParams(params).toString()}`);

    if (denied) return back({ google: 'denied', reason: denied });
    if (!code || !state) return back({ google: 'error', reason: 'missing_code' });

    try {
      const result = await googleConnect.completeGoogleConnection(code, state);
      return back({
        google: 'connected',
        locations: String(result.locationsFound),
        sites: String(result.sitesFound),
        ...(result.businessProfileAvailable ? {} : { businessProfile: 'unavailable' }),
      });
    } catch (error) {
      logger.warn({ err: error }, 'Google connection failed');
      return back({
        google: 'error',
        reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
    }
  }),
);
