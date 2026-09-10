/** Applies pending migrations, then exits. Run before starting the API. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

try {
  // Resolved from this file, not the cwd, so it works from any workspace root.
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
  await migrate(drizzle(migrationClient), { migrationsFolder });
  logger.info('Migrations applied');
} catch (error) {
  logger.error({ err: error }, 'Migration failed');
  process.exitCode = 1;
} finally {
  await migrationClient.end();
}
