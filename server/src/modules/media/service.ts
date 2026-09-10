/**
 * Media assets.
 *
 * The server records what was uploaded; it never handles the bytes. Assets are
 * addressed by public URL because both Facebook and Instagram fetch media
 * themselves rather than accepting an upload from us.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { CreativeKind } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { mediaAssets } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { videoThumbnailUrl, withVideoTransformation } from '../../integrations/cloudinary.js';

export interface RegisterMediaInput {
  kind: CreativeKind;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bytes?: number;
  source?: string;
  providerRef?: string;
}

/** Stores the transformed delivery URL so every consumer gets the same asset. */
export async function registerMedia(organizationId: string, input: RegisterMediaInput) {
  const url = input.kind === 'video' ? withVideoTransformation(input.url) : input.url;
  const thumbnailUrl =
    input.thumbnailUrl ?? (input.kind === 'video' ? videoThumbnailUrl(input.url) : input.url);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      organizationId,
      kind: input.kind,
      url,
      thumbnailUrl: thumbnailUrl ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
      bytes: input.bytes ?? null,
      source: input.source ?? 'upload',
      providerRef: input.providerRef ?? null,
    })
    .returning();

  return asset!;
}

export async function listMedia(organizationId: string, limit = 50) {
  return db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.organizationId, organizationId))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);
}

export async function getMedia(organizationId: string, id: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.organizationId, organizationId)))
    .limit(1);

  if (!asset) throw notFound('Media asset not found');
  return asset;
}
