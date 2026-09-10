/**
 * Job queues.
 *
 * Publishing, rendering and WhatsApp sends all outlive an HTTP request — an
 * Instagram video container alone can take 80 seconds to process — so they run
 * as jobs here rather than blocking a response.
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../lib/env.js';

/** BullMQ requires this setting and errors loudly without it. */
export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE_NAMES = {
  publish: 'publish',
  render: 'render',
  whatsapp: 'whatsapp',
  metrics: 'metrics',
} as const;

/** Retries use exponential backoff: provider APIs fail transiently under load. */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
};

export const publishQueue = new Queue(QUEUE_NAMES.publish, { connection, defaultJobOptions });
export const renderQueue = new Queue(QUEUE_NAMES.render, { connection, defaultJobOptions });
export const whatsappQueue = new Queue(QUEUE_NAMES.whatsapp, { connection, defaultJobOptions });
export const metricsQueue = new Queue(QUEUE_NAMES.metrics, { connection, defaultJobOptions });

export const allQueues = [publishQueue, renderQueue, whatsappQueue, metricsQueue];
