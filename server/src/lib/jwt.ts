/**
 * Access-token issuing and verification.
 *
 * Access tokens are short-lived and stateless; revocation is handled by the
 * refresh-token table, which is why access lifetime is kept to minutes.
 */

import { SignJWT, jwtVerify } from 'jose';
import { env } from './env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'socialboost';
const ACCESS_TOKEN_TTL = '15m';

export interface AccessTokenClaims {
  userId: string;
  email: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret);
}

/** Returns null for any invalid, expired or malformed token — never throws. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
