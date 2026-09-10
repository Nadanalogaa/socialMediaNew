/**
 * Job queues.
 *
 * Publishing, rendering and WhatsApp sends all outlive an HTTP request — an
 * Instagram video container alone can take 90 seconds to transcode — so they
 * run as jobs here rather than blocking a response.
 *
 * Connections are lazy and created once per process. In a serverless runtime a
 * warm invocation reuses the socket; a cold one opens exactly one. Eager
 * connection at import time would open a socket on every cold start, which
 * burns through a metered Redis plan quickly.
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../lib/env.js';

export const connection = new Redis(env.REDIS_URL, {
  /** Required by BullMQ; it manages its own retry semantics. */
  maxRetriesPerRequest: null,
  /** Defer the socket until something actually uses the queue. */
  lazyConnect: true,
  enableReadyCheck: false,
  /** Upstash and other hosted Redis require TLS on rediss:// URLs. */
  ...(env.REDIS_URL.startsWith('rediss://') ? { tls: {} } : {}),
});

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
