/**
 * Worker entry point.
 *
 * Runs in its own process so a long render or a rate-limited provider call
 * cannot occupy an API request handler. Queues without a processor yet log
 * their jobs rather than dropping them silently.
 */

import { Worker, type Job } from 'bullmq';
import { closeDatabase } from './db/client.js';
import { QUEUE_NAMES, connection, metricsQueue } from './queue/index.js';
import { processMetricsJob } from './queue/processors/metrics.js';
import { processHealthSweep } from './queue/processors/health.js';
import { sendWeeklyDigests } from './modules/nudges/service.js';
import { processPublishJob } from './queue/processors/publish.js';
import { logger } from './lib/logger.js';

const workers: Worker[] = [];

function register(name: string, processor: (job: Job) => Promise<void>, concurrency = 5) {
  const worker = new Worker(name, processor, { connection, concurrency });

  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, err }, 'Job failed');
  });
  worker.on('completed', (job) => {
    logger.debug({ queue: name, jobId: job.id }, 'Job completed');
  });

  workers.push(worker);
}

/** Placeholder for queues whose pillar has not landed yet. */
const notImplemented = (name: string) => async (job: Job) => {
  logger.info({ queue: name, jobId: job.id, data: job.data }, 'Job received (no processor yet)');
};

// Publishing is IO-bound and rate-limited per page, so concurrency stays low.
register(QUEUE_NAMES.publish, processPublishJob as (job: Job) => Promise<void>, 3);
register(QUEUE_NAMES.render, notImplemented(QUEUE_NAMES.render));
register(QUEUE_NAMES.whatsapp, notImplemented(QUEUE_NAMES.whatsapp));
register(
  QUEUE_NAMES.metrics,
  (async (job: Job) => {
    if (job.name === 'health-sweep') return processHealthSweep();
    if (job.name === 'weekly-digest') return void (await sendWeeklyDigests());
    return processMetricsJob(job as never);
  }) as (job: Job) => Promise<void>,
  2,
);

// Once a day, every channel's token is probed. The scheduler is idempotent:
// restarting the worker neither duplicates nor resets it.
void metricsQueue
  .upsertJobScheduler('health-sweep', { every: 24 * 60 * 60 * 1000 }, { name: 'health-sweep', data: {} })
  .catch((error) => logger.warn({ err: error }, 'Could not schedule the health sweep'));

// Monday 08:00 in India: the week's to-dos land before the week starts.
void metricsQueue
  .upsertJobScheduler('weekly-digest', { pattern: '30 2 * * 1' }, { name: 'weekly-digest', data: {} })
  .catch((error) => logger.warn({ err: error }, 'Could not schedule the weekly digest'));

logger.info({ queues: Object.values(QUEUE_NAMES) }, 'Worker started');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'Worker shutting down');
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    await closeDatabase();
    process.exit(0);
  });
}
