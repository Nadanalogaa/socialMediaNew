import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { authRouter } from '../modules/auth/routes.js';
import { connectionsRouter } from '../modules/connections/routes.js';
import { mediaRouter } from '../modules/media/routes.js';
import { postsRouter } from '../modules/posts/routes.js';
import { webhooksRouter } from '../modules/webhooks/routes.js';
import { env, isProduction } from '../lib/env.js';
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

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: corsOrigin(), credentials: true }));
  app.use(pinoHttp({ logger }));

  // Media never passes through this process — uploads go straight to Cloudinary
  // with a signed request — so a small JSON limit is all the API needs.
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/connections', connectionsRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/posts', postsRouter);
  // Unauthenticated by necessity: Meta calls these directly and proves
  // itself with a signed request rather than a bearer token.
  app.use('/api/webhooks', webhooksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
