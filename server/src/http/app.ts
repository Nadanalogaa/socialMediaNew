import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { authRouter } from '../modules/auth/routes.js';
import { analyticsRouter } from '../modules/analytics/routes.js';
import { connectionsRouter } from '../modules/connections/routes.js';
import { googleCallbackRouter } from '../modules/connections/google-callback.js';
import { creativesRouter } from '../modules/creatives/routes.js';
import { ideasRouter } from '../modules/ideas/routes.js';
import { billingRouter } from '../modules/billing/routes.js';
import { adminRouter } from '../modules/admin/routes.js';
import * as billing from '../modules/billing/service.js';
import { verifyWebhookSignature } from '../integrations/razorpay.js';
import { mediaRouter } from '../modules/media/routes.js';
import { organizationsRouter } from '../modules/organizations/routes.js';
import { postsRouter } from '../modules/posts/routes.js';
import { legacyWebhooksRouter, webhooksRouter } from '../modules/webhooks/routes.js';
import { env, features, isProduction } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware.js';

/**
 * Allowed browser origins.
 *
 * Production pins to the single configured APP_URL. Development also accepts
 * the hostnames Facebook Login forces us through: `lvh.me` (a public DNS name
 * resolving to 127.0.0.1, since Meta rejects bare `localhost`) and tunnel
 * domains used to expose callbacks to Meta.
 */
function corsOrigin() {
  if (isProduction) return env.APP_URL;

  const devPattern = /^https?:\/\/(localhost|127\.0\.0\.1|([a-z0-9-]+\.)*lvh\.me|([a-z0-9-]+\.)*localtest\.me)(:\d+)?$/;
  const tunnelPattern = /^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/;

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Same-origin and non-browser callers send no Origin header.
    if (!origin) return callback(null, true);
    callback(null, devPattern.test(origin) || tunnelPattern.test(origin));
  };
}

/** The built web app, when this process also serves it (the Docker image). */
const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../web/dist');

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  // Hardening headers on the API only: helmet's defaults on the HTML would
  // block the Facebook SDK (its content-security policy) and break the login
  // popup (cross-origin-opener-policy severs window.opener).
  app.use(['/api', '/auth'], helmet());
  app.use(cors({ origin: corsOrigin(), credentials: true }));
  app.use(pinoHttp({ logger }));

  // Razorpay signs the raw body, so this route reads it before the JSON
  // parser gets a chance to re-encode it.
  app.post('/api/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const signature = String(req.header('x-razorpay-signature') ?? '');
    const raw = req.body as Buffer;
    if (!verifyWebhookSignature(raw, signature)) {
      logger.warn('Rejected a Razorpay webhook with a bad signature');
      return res.status(400).json({ received: false });
    }
    let event: { event: string; payload: Record<string, unknown> };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ received: false });
    }
    billing
      .handleWebhook(event)
      .then(() => res.json({ received: true }))
      .catch((error) => {
        logger.error({ err: error }, 'Razorpay webhook failed');
        res.status(500).json({ received: false });
      });
  });

  // Media never passes through this process — uploads go straight to Cloudinary
  // with a signed request — so a small JSON limit is all the API needs.
  app.use(express.json({ limit: '1mb' }));

  // Registered at both paths: /health for the container check and tooling,
  // /api/health through the proxy.
  const health = (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  };
  app.get('/health', health);
  app.get('/api/health', health);

  /**
   * What this deployment can actually do.
   *
   * The client hides features whose integration is unconfigured, rather than
   * offering a button that always fails.
   */
  app.get('/api/config', (_req, res) => {
    res.json({ features });
  });

  app.use('/api/auth', authRouter);
  // Mounted before the authenticated router: Google redirects here with no token.
  app.use('/api/connections', googleCallbackRouter);
  app.use('/api/connections', connectionsRouter);
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/creatives', creativesRouter);
  app.use('/api/ideas', ideasRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/posts', postsRouter);
  // Unauthenticated by necessity: Meta calls these directly and proves
  // itself with a signed request rather than a bearer token.
  app.use('/api/webhooks', webhooksRouter);
  // Serves the callback path still configured in Meta's app settings.
  app.use('/auth', legacyWebhooksRouter);

  if (isProduction && existsSync(WEB_DIST)) serveWeb(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Serves the web app from the same process, as the Docker image does.
 *
 * Hashed assets are immutable; everything else — index.html, the service
 * worker, the manifest — must be revalidated so a deploy reaches browsers.
 */
function serveWeb(app: Express): void {
  // The paths registered in Meta's app settings.
  app.get('/privacy-policy.html', (_req, res) => res.sendFile(resolve(WEB_DIST, 'privacy.html')));
  app.get('/terms-of-service.html', (_req, res) => res.sendFile(resolve(WEB_DIST, 'terms.html')));

  app.use(
    express.static(WEB_DIST, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Cache-Control',
          filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );

  // Every other GET is a client-side route.
  app.get(/^(?!\/api\/|\/auth\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolve(WEB_DIST, 'index.html'));
  });
}
