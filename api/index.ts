/**
 * Vercel serverless entry point for the API.
 *
 * Kept alongside the Docker image until the Portainer stack is live; delete
 * this file and vercel.json when Vercel is switched off. Vercel invokes this
 * for every `/api/*` request; the Express app is built once per process and
 * reused across warm invocations.
 *
 * The worker is deliberately not here: BullMQ workers are long-lived
 * processes, which a serverless runtime cannot host.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/src/http/app.js';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
