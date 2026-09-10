/**
 * Typed application errors.
 *
 * Routes throw these; a single error middleware turns them into responses.
 * Anything that is not an AppError is treated as a bug: logged with its stack
 * and reported to the client as a generic 500, so internals never leak.
 */

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

/** Raised when an action would exceed the organization's plan limits. */
export const quotaExceeded = (message: string, details?: unknown) =>
  new AppError(402, 'quota_exceeded', message, details);

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'rate_limited', message);

/** A configured-off integration, e.g. billing before Razorpay keys are set. */
export const serviceUnavailable = (message: string) =>
  new AppError(503, 'service_unavailable', message);
