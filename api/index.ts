/**
 * Vercel serverless entry point for the API.
 *
 * Vercel invokes this for every `/api/*` request. The Express app is built
 * once per process and reused across warm invocations, so the database and
 * Redis pools are shared rather than rebuilt per request.
 *
 * The worker is deliberately not here: BullMQ workers are long-lived
 * processes, which a serverless runtime cannot host. Queued jobs wait until a
 * worker runs elsewhere.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/src/http/app.js';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
