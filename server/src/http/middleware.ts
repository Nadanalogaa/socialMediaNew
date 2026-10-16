/**
 * Request plumbing: authentication, tenant resolution, validation and the
 * single error boundary every route funnels through.
 */

import type { NextFunction, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { ZodError, type ZodSchema } from 'zod';
import type { Role } from '@socialboost/shared';
import { db } from '../db/client.js';
import { memberships, organizations, users } from '../db/schema.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { GraphApiError } from '../integrations/meta.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; email: string };
      /** Populated by `withOrganization`; every tenant query scopes to this. */
      tenant?: { organizationId: string; role: Role; planCode: string };
    }
  }
}

/** Rejects the request unless a valid bearer token is present. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  const claims = await verifyAccessToken(header.slice(7));
  if (!claims) return next(unauthorized('Session expired or invalid'));

  req.auth = claims;
  next();
}

/**
 * Resolves the active organization from the `X-Organization-Id` header and
 * confirms the caller is a member of it.
 *
 * This is the tenant boundary: a route that uses `req.tenant.organizationId`
 * cannot read another tenant's rows, because membership is verified here
 * rather than trusted from the client.
 */
export async function withOrganization(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());

  const organizationId = req.header('X-Organization-Id');
  if (!organizationId) {
    return next(new AppError(400, 'organization_required', 'X-Organization-Id header is required'));
  }

  const [row] = await db
    .select({ role: memberships.role, planCode: organizations.planCode, suspendedAt: organizations.suspendedAt })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, req.auth.userId),
      ),
    )
    .limit(1);

  // Same response whether the org is missing or simply not theirs, so the
  // endpoint cannot be used to probe which organization ids exist.
  if (!row) return next(forbidden('You are not a member of this organization'));
  if (row.suspendedAt && req.method !== 'GET') {
    return next(new AppError(402, 'suspended', 'This workspace is suspended. Please contact support.'));
  }

  req.tenant = { organizationId, role: row.role, planCode: row.planCode };
  next();
}

/** Platform admins run the service itself; the flag lives on the user row. */
export async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  const [user] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, req.auth.userId))
    .limit(1);
  if (!user?.isPlatformAdmin) return next(forbidden('Platform admins only'));
  next();
}

/** Restricts a route to specific roles. Use after `withOrganization`. */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) return next(forbidden());
    if (!allowed.includes(req.tenant.role)) {
      return next(forbidden(`This action requires one of: ${allowed.join(', ')}`));
    }
    next();
  };
}

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validates one part of the request against a Zod schema and replaces it with
 * the parsed value, so handlers receive coerced, typed data.
 */
export function validate<T>(schema: ZodSchema<T>, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(
        new AppError(422, 'validation_failed', 'Request validation failed', formatZod(result.error)),
      );
    }
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
    next();
  };
}

function formatZod(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req as T, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
}

/** The single place an error becomes a response. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // A provider rejecting a request is not a bug in this service, and the
  // caller can usually act on what the provider said.
  if (err instanceof GraphApiError) {
    logger.warn({ err, path: req.path, code: err.code }, 'Graph API error');
    const status = err.isAuthError ? 401 : err.isRateLimit ? 429 : 400;
    return res.status(status).json({
      error: {
        code: err.isAuthError ? 'facebook_auth_failed' : 'facebook_error',
        message: err.isAuthError
          ? `Facebook rejected the sign-in: ${err.message}. Please connect again.`
          : `Facebook returned an error: ${err.message}`,
        details: { graphCode: err.code, graphSubcode: err.subcode },
      },
    });
  }

  // Unrecognised errors are bugs: log the detail, tell the client nothing.
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong on our side.' },
  });
}
