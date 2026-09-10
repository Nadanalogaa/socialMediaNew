/**
 * Meta `signed_request` parsing.
 *
 * Meta posts this to the deauthorize and data-deletion callbacks. It is a
 * base64url payload with an HMAC-SHA256 signature keyed on the app secret, so
 * verifying it is what proves the request genuinely came from Meta and not
 * from anyone who found the URL.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env.js';

export interface SignedRequestPayload {
  /** The Facebook user the request concerns. */
  user_id: string;
  algorithm: string;
  issued_at?: number;
  [key: string]: unknown;
}

/**
 * Verifies and decodes a signed request.
 *
 * Returns null rather than throwing for anything malformed or unsigned — a
 * caller receiving null should respond as if nothing matched, never leak why.
 */
export function parseSignedRequest(signedRequest: string): SignedRequestPayload | null {
  if (!env.META_APP_SECRET) return null;

  const [encodedSignature, encodedPayload] = signedRequest.split('.');
  if (!encodedSignature || !encodedPayload) return null;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Meta only signs with HMAC-SHA256; anything else is a downgrade attempt.
  if (payload.algorithm?.toUpperCase() !== 'HMAC-SHA256') return null;

  const expected = createHmac('sha256', env.META_APP_SECRET).update(encodedPayload).digest();
  const provided = Buffer.from(encodedSignature, 'base64url');

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  return payload;
}
