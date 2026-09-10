/**
 * Registration, login and refresh-token rotation.
 *
 * Refresh tokens are single-use: presenting one revokes it and issues a
 * replacement, so a stolen token stops working as soon as the real user
 * refreshes (and vice versa, making theft detectable).
 */

import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { RegisterInput } from '@socialboost/shared';
import { db } from '../../db/client.js';
import {
  brandProfiles,
  memberships,
  organizations,
  refreshTokens,
  users,
} from '../../db/schema.js';
import { generateOpaqueToken, hashPassword, verifyPassword } from '../../lib/crypto.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';

const REFRESH_TOKEN_TTL_DAYS = 30;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string; role: string };
}

const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** URL-safe slug with a short random suffix, avoiding a uniqueness retry loop. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'org'}-${suffix}`;
}

/**
 * Creates the user, their organization, the owner membership and a starter
 * brand profile in one transaction — a half-registered account is not a state
 * the rest of the app should ever have to handle.
 */
export async function register(input: RegisterInput, userAgent?: string): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, name: input.name.trim() })
      .returning();

    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.organizationName.trim(), slug: slugify(input.organizationName) })
      .returning();

    if (!user || !organization) throw new Error('Failed to create account');

    await tx
      .insert(memberships)
      .values({ organizationId: organization.id, userId: user.id, role: 'owner' });

    // Seeded from the org name so AI generation has a brand voice immediately.
    await tx
      .insert(brandProfiles)
      .values({ organizationId: organization.id, name: input.organizationName.trim() });

    return { user, organization };
  });

  return issueSession(
    result.user,
    {
      id: result.organization.id,
      name: result.organization.name,
      slug: result.organization.slug,
      role: 'owner',
    },
    userAgent,
  );
}

export async function login(
  email: string,
  password: string,
  userAgent?: string,
): Promise<AuthResult> {
  const normalized = email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);

  // Verify against a dummy hash when the user is unknown so the response time
  // does not reveal whether an email is registered.
  const stored = user?.passwordHash ?? (await hashPassword('invalid-placeholder'));
  const valid = await verifyPassword(password, stored);
  if (!user || !valid) throw unauthorized('Invalid email or password');

  const [membership] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (!membership) throw unauthorized('This account has no organization');

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return issueSession(user, membership, userAgent);
}

/** Rotates a refresh token, returning a fresh pair. */
export async function refresh(token: string, userAgent?: string): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(token);

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) throw unauthorized('Session expired, please sign in again');

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) throw unauthorized();

  const [membership] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (!membership) throw unauthorized('This account has no organization');
  return issueSession(user, membership, userAgent);
}

export async function logout(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)));
}

async function issueSession(
  user: { id: string; email: string; name: string },
  organization: { id: string; name: string; slug: string; role: string },
  userAgent?: string,
): Promise<AuthResult> {
  const accessToken = await signAccessToken({ userId: user.id, email: user.email });
  const refreshToken = generateOpaqueToken();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt,
    userAgent: userAgent?.slice(0, 500),
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
    organization,
  };
}
