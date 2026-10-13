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
import { logger } from '../lib/logger.js';

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

/**
 * Waits for the shared connection to be usable.
 *
 * A serverless function is frozen between invocations and its sockets die
 * with it, so a client that was ready on one request is often closed on the
 * next. ioredis reports that as "Connection is closed" rather than
 * reconnecting on its own when it was opened lazily.
 */
async function ensureConnected(timeoutMs = 8000): Promise<void> {
  if (connection.status === 'ready') return;

  if (connection.status === 'wait' || connection.status === 'end') {
    await connection.connect();
    return;
  }

  // Already dialling: wait for it rather than opening a second socket.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out connecting to Redis')), timeoutMs);
    const done = () => {
      clearTimeout(timer);
      connection.off('error', fail);
      resolve();
    };
    const fail = (error: Error) => {
      clearTimeout(timer);
      connection.off('ready', done);
      reject(error);
    };
    connection.once('ready', done);
    connection.once('error', fail);
  });
}

function isConnectionClosed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Connection is closed') ||
    message.includes('Stream isn\'t writeable') ||
    message.includes('ECONNRESET')
  );
}

/**
 * Adds a job, reopening the connection if the previous one died.
 *
 * One retry is enough: a second failure is a real outage rather than a stale
 * socket, and the caller needs to hear about it.
 */
export async function enqueue(
  queue: Queue,
  name: string,
  data: unknown,
  options?: Parameters<Queue['add']>[2],
): Promise<void> {
  try {
    await ensureConnected();
    await queue.add(name, data as never, options);
  } catch (error) {
    if (!isConnectionClosed(error)) throw error;

    logger.warn('Redis connection had closed; reconnecting and retrying once');
    try {
      connection.disconnect();
    } catch {
      /* Already gone. */
    }
    await connection.connect();
    await queue.add(name, data as never, options);
  }
}
