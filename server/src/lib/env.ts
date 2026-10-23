/**
 * Environment configuration, validated once at boot.
 *
 * The process refuses to start if anything required is missing or malformed,
 * so a misconfigured deploy fails immediately and loudly instead of throwing
 * at the first request that happens to need a key.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * The workspace keeps a single .env at the repo root so the API, the worker and
 * the migration scripts all read the same values regardless of their cwd.
 */
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

  /** Signs access and refresh tokens. Rotate by redeploying with a new value. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** 32-byte hex key for AES-256-GCM encryption of stored provider tokens. */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  GEMINI_API_KEY: z.string().optional(),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** Echoed back to Meta when verifying a webhook subscription. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  /** One Google Cloud project serves every tenant, as with the Meta app. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Issued by Google Ads to the manager account; campaigns need it. */
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  /** The manager (MCC) account id, digits only, that holds the token. */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),

  /** Places API (New) key, for the nearby-competitor snapshot. */
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  /** Brevo transactional email, for weekly digests, invitations and sign-up mail. */
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('PostReels <admin@nadanaloga.com>'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

/** Feature availability, so routes can 503 clearly instead of failing obscurely. */
export const features = {
  ai: Boolean(env.GEMINI_API_KEY),
  meta: Boolean(env.META_APP_ID && env.META_APP_SECRET),
  cloudinary: Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  ),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  googleAds: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_ADS_DEVELOPER_TOKEN),
  billing: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  places: Boolean(env.GOOGLE_PLACES_API_KEY),
  email: Boolean(env.BREVO_API_KEY),
} as const;
