/**
 * Saved designs.
 *
 * A design stores its whole editable document, not just the values that were
 * fed into a template — so a reel can be reopened exactly as it was left even
 * after the template it began from has changed.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { AspectRatioKey, CreativeKind } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { creatives, magicBriefs, mediaAssets } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';

export interface SaveDesignInput {
  id?: string;
  name: string;
  kind: CreativeKind;
  ratio: AspectRatioKey;
  document: Record<string, unknown>;
  shortDescription?: string;
  description?: string;
  tags?: string[];
  /** The last rendered image or video, used as the library thumbnail. */
  renderedAssetId?: string;
}

export async function saveDesign(
  organizationId: string,
  userId: string,
  input: SaveDesignInput,
) {
  const values = {
    organizationId,
    name: input.name.trim() || 'Untitled',
    kind: input.kind,
    ratio: input.ratio,
    document: input.document,
    shortDescription: input.shortDescription?.trim() || null,
    description: input.description?.trim() || null,
    tags: input.tags ?? [],
    renderedAssetId: input.renderedAssetId ?? null,
    status: 'saved',
    updatedAt: new Date(),
  };

  if (input.id) {
    const [updated] = await db
      .update(creatives)
      .set(values)
      .where(and(eq(creatives.id, input.id), eq(creatives.organizationId, organizationId)))
      .returning();
    if (!updated) throw notFound('Design not found');
    return updated;
  }

  const [created] = await db
    .insert(creatives)
    .values({ ...values, createdBy: userId })
    .returning();
  return created!;
}

export interface DesignSummary {
  id: string;
  name: string;
  kind: CreativeKind;
  ratio: AspectRatioKey;
  shortDescription: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  previewUrl: string | null;
  updatedAt: Date;
}

/** Library listing, optionally narrowed by kind or a tag. */
export async function listDesigns(
  organizationId: string,
  filter: { kind?: CreativeKind; tag?: string } = {},
): Promise<DesignSummary[]> {
  const conditions = [eq(creatives.organizationId, organizationId)];
  if (filter.kind) conditions.push(eq(creatives.kind, filter.kind));
  // Containment on the JSON array, so a tag filter stays a single query.
  if (filter.tag) conditions.push(sql`${creatives.tags} @> ${JSON.stringify([filter.tag])}::jsonb`);

  return db
    .select({
      id: creatives.id,
      name: creatives.name,
      kind: creatives.kind,
      ratio: creatives.ratio,
      shortDescription: creatives.shortDescription,
      tags: creatives.tags,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      previewUrl: mediaAssets.url,
      updatedAt: creatives.updatedAt,
    })
    .from(creatives)
    .leftJoin(mediaAssets, eq(mediaAssets.id, creatives.renderedAssetId))
    .where(and(...conditions))
    .orderBy(desc(creatives.updatedAt));
}

export async function getDesign(organizationId: string, id: string) {
  const [design] = await db
    .select()
    .from(creatives)
    .where(and(eq(creatives.id, id), eq(creatives.organizationId, organizationId)))
    .limit(1);

  if (!design) throw notFound('Design not found');
  return design;
}

export async function deleteDesign(organizationId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(creatives)
    .where(and(eq(creatives.id, id), eq(creatives.organizationId, organizationId)))
    .returning({ id: creatives.id });

  if (deleted.length === 0) throw notFound('Design not found');
}

/** Every tag in use, for the library's filter. */
export async function listTags(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ tag: sql<string>`jsonb_array_elements_text(${creatives.tags})` })
    .from(creatives)
    .where(eq(creatives.organizationId, organizationId));

  return [...new Set(rows.map((row) => row.tag))].sort();
}

// --- Magic Design briefs ---------------------------------------------------

export interface SaveBriefInput {
  id?: string;
  name: string;
  brief: string;
  scenePhotos: Record<string, string>;
  brandColor: string;
  accentColor: string;
}

/** Records a brief, updating the entry it was reopened from. */
export async function saveBrief(organizationId: string, userId: string, input: SaveBriefInput) {
  const values = {
    organizationId,
    name: input.name.trim().slice(0, 120) || 'Untitled brief',
    brief: input.brief,
    scenePhotos: input.scenePhotos,
    brandColor: input.brandColor,
    accentColor: input.accentColor,
    updatedAt: new Date(),
  };

  if (input.id) {
    const [updated] = await db
      .update(magicBriefs)
      .set(values)
      .where(and(eq(magicBriefs.id, input.id), eq(magicBriefs.organizationId, organizationId)))
      .returning();
    if (updated) return updated;
    // The entry was deleted meanwhile; keep the brief rather than lose it.
  }

  const [created] = await db
    .insert(magicBriefs)
    .values({ ...values, createdBy: userId })
    .returning();
  return created!;
}

export async function listBriefs(organizationId: string) {
  return db
    .select()
    .from(magicBriefs)
    .where(eq(magicBriefs.organizationId, organizationId))
    .orderBy(desc(magicBriefs.updatedAt))
    .limit(50);
}

export async function deleteBrief(organizationId: string, id: string): Promise<void> {
  await db
    .delete(magicBriefs)
    .where(and(eq(magicBriefs.id, id), eq(magicBriefs.organizationId, organizationId)));
}
