/**
 * Organizations.
 *
 * An organization is the tenant boundary: its connections, posts, media and
 * billing are entirely separate from every other. An agency therefore keeps one
 * organization per client, which is what stops a post intended for one client
 * reaching another's Page.
 */

import { and, asc, eq } from 'drizzle-orm';
import type { Role } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { brandProfiles, memberships, organizations } from '../../db/schema.js';
import { forbidden, notFound } from '../../lib/errors.js';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

/** URL-safe slug with a short random suffix, avoiding a uniqueness retry loop. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Every organization the user belongs to, oldest first so order is stable. */
export async function listForUser(userId: string): Promise<OrganizationSummary[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
}

/**
 * Creates an organization with the caller as owner.
 *
 * The membership and a starter brand profile are written in the same
 * transaction, so a half-created workspace is not a state the rest of the app
 * has to handle.
 */
export async function create(userId: string, name: string): Promise<OrganizationSummary> {
  const trimmed = name.trim();

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: trimmed, slug: slugify(trimmed) })
      .returning();

    if (!organization) throw new Error('Failed to create organization');

    await tx
      .insert(memberships)
      .values({ organizationId: organization.id, userId, role: 'owner' });

    // Seeded so AI generation has a brand voice from the first use.
    await tx.insert(brandProfiles).values({ organizationId: organization.id, name: trimmed });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: 'owner' as Role,
    };
  });
}

export async function rename(
  userId: string,
  organizationId: string,
  name: string,
): Promise<OrganizationSummary> {
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)),
    )
    .limit(1);

  if (!membership) throw notFound('Organization not found');
  if (membership.role === 'member') throw forbidden('Only an owner or admin can rename a workspace');

  const [updated] = await db
    .update(organizations)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(organizations.id, organizationId))
    .returning();

  if (!updated) throw notFound('Organization not found');
  return { id: updated.id, name: updated.name, slug: updated.slug, role: membership.role };
}
