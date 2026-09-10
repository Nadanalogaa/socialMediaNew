import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '../lib/env.js';
import * as schema from './schema.js';

/**
 * One pool for the process. `max` is deliberately small: the API and the worker
 * each hold a pool, and managed Postgres plans cap total connections.
 */
const queryClient = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;

export async function closeDatabase(): Promise<void> {
  await queryClient.end({ timeout: 5 });
}
