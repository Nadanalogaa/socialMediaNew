/**
 * Development seed.
 *
 * Creates a connection with a deliberately invalid token so the publish
 * pipeline's failure path can be exercised without live Meta credentials.
 * Never run against production.
 */

import { eq } from 'drizzle-orm';
import { connections, organizations } from './schema.js';
import { db, closeDatabase } from './client.js';
import { encryptToken } from '../lib/crypto.js';

const slug = process.argv[2];

const orgs = await db
  .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
  .from(organizations);

const org = slug ? orgs.find((o) => o.slug === slug) : orgs[0];

if (!org) {
  console.error('No organization found. Register one first.');
  console.error('Available:', orgs.map((o) => o.slug).join(', ') || '(none)');
  await closeDatabase();
  process.exit(1);
}

const [created] = await db
  .insert(connections)
  .values({
    organizationId: org.id,
    provider: 'facebook_page',
    externalId: '999999999999',
    displayName: 'Test Page (invalid token)',
    accessTokenEncrypted: encryptToken('EAA-deliberately-invalid-token'),
    metadata: {},
  })
  .onConflictDoUpdate({
    target: [connections.organizationId, connections.provider, connections.externalId],
    set: { displayName: 'Test Page (invalid token)', status: 'active', lastError: null },
  })
  .returning();

console.log(JSON.stringify({ organizationId: org.id, slug: org.slug, connectionId: created!.id }));
await closeDatabase();
