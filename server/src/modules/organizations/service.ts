/**
 * Organizations.
 *
 * An organization is the tenant boundary: its connections, posts, media and
 * billing are entirely separate from every other. An agency therefore keeps one
 * organization per client, which is what stops a post intended for one client
 * reaching another's Page.
 */

import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Role } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { brandProfiles, invitations, memberships, organizations, users } from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';

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

// --- Settings -----------------------------------------------------------------

export async function getSettings(organizationId: string) {
  const [row] = await db
    .select({
      timezone: organizations.timezone,
      postingSlots: organizations.postingSlots,
      requireApproval: organizations.requireApproval,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row ?? { timezone: 'Asia/Kolkata', postingSlots: [], requireApproval: false };
}

export async function updateSettings(
  organizationId: string,
  input: {
    timezone?: string;
    postingSlots?: { days: number[]; time: string }[];
    requireApproval?: boolean;
  },
) {
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
    } catch {
      throw badRequest('That time zone is not recognised.');
    }
  }
  await db
    .update(organizations)
    .set({
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.postingSlots ? { postingSlots: input.postingSlots } : {}),
      ...(input.requireApproval !== undefined ? { requireApproval: input.requireApproval } : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
  return getSettings(organizationId);
}

// --- Team -----------------------------------------------------------------------

export async function listMembers(organizationId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(memberships.createdAt));
}

/** The last owner cannot be demoted or removed, or nobody could run the workspace. */
async function assertNotLastOwner(organizationId: string, userId: string): Promise<void> {
  const [target] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
    .limit(1);
  if (!target) throw notFound('That person is not a member');
  if (target.role !== 'owner') return;
  const owners = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, 'owner')));
  if (owners.length <= 1) throw conflict('A workspace needs at least one owner.');
}

export async function setMemberRole(organizationId: string, userId: string, role: Role) {
  await assertNotLastOwner(organizationId, userId);
  await db
    .update(memberships)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));
  return listMembers(organizationId);
}

export async function removeMember(organizationId: string, userId: string) {
  await assertNotLastOwner(organizationId, userId);
  await db
    .delete(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));
  return listMembers(organizationId);
}

const INVITE_TTL_DAYS = 14;

export async function createInvitation(
  organizationId: string,
  invitedBy: string,
  input: { email: string; role: Role },
) {
  const email = input.email.trim().toLowerCase();
  const [already] = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, email), eq(memberships.organizationId, organizationId)))
    .limit(1);
  if (already) throw conflict('That person is already a member of this workspace.');

  // Any earlier open invitation for the same address is replaced.
  await db
    .delete(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
      ),
    );

  const [created] = await db
    .insert(invitations)
    .values({
      organizationId,
      email,
      role: input.role,
      token: randomBytes(24).toString('base64url'),
      invitedBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    })
    .returning();
  return created!;
}

export async function listInvitations(organizationId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      token: invitations.token,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(eq(invitations.organizationId, organizationId))
    .orderBy(desc(invitations.createdAt))
    .limit(100);
}

export async function deleteInvitation(organizationId: string, id: string): Promise<void> {
  await db
    .delete(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.organizationId, organizationId)));
}

/** What an invitation link shows before the person signs in. */
export async function describeInvitation(token: string) {
  const [row] = await db
    .select({
      organizationName: organizations.name,
      role: invitations.role,
      email: invitations.email,
      inviter: users.name,
      acceptedAt: invitations.acceptedAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.token, token))
    .limit(1);
  if (!row) throw notFound('This invitation link is not valid.');
  return {
    organizationName: row.organizationName,
    role: row.role,
    email: row.email,
    inviter: row.inviter ?? 'A workspace owner',
    accepted: row.acceptedAt !== null,
    expired: row.expiresAt.getTime() < Date.now(),
  };
}

/**
 * Joins the signed-in user to the invitation's workspace.
 *
 * The address on the invitation is advisory: links get forwarded, and the
 * owner chose who to send it to. An existing member keeps their membership
 * and takes the invited role only if it is higher than what they had.
 */
export async function acceptInvitation(token: string, userId: string): Promise<OrganizationSummary> {
  const [invite] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  if (!invite) throw notFound('This invitation link has expired or was already used.');

  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ organizationId: invite.organizationId, userId, role: invite.role })
      .onConflictDoNothing();
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(invitations.id, invite.id));
  });

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.organizationId, invite.organizationId), eq(memberships.userId, userId)))
    .limit(1);
  if (!org) throw notFound('Organization not found');
  return org;
}

// --- Brand kit ---------------------------------------------------------------

export async function getBrand(organizationId: string): Promise<typeof brandProfiles.$inferSelect> {
  const [row] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, organizationId))
    .limit(1);
  if (row) return row;
  // Organisations created before the kit existed get one on first read.
  const [created] = await db
    .insert(brandProfiles)
    .values({ organizationId, name: 'My business' })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getBrand(organizationId));
}

export async function updateBrand(
  organizationId: string,
  input: Record<string, unknown> & { defaultHashtags?: string[] },
) {
  await getBrand(organizationId);
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    values[key] = typeof value === 'string' ? value.trim() || null : value;
  }
  if (input.defaultHashtags) {
    values.defaultHashtags = [
      ...new Set(input.defaultHashtags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean)),
    ];
  }
  if (typeof values.name === 'string' && !values.name) delete values.name;
  await db.update(brandProfiles).set(values).where(eq(brandProfiles.organizationId, organizationId));
  return getBrand(organizationId);
}
