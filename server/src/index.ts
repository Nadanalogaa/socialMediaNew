/** API entry point. Workers run separately via `worker.ts`. */
import { createApp } from './http/app.js';
import { closeDatabase } from './db/client.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

/** Finish in-flight requests before exiting so deploys do not drop responses. */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  });
}
