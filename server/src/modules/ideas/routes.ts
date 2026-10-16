/**
 * Ideas: the board of things to post about later.
 *
 * Deliberately simple — a line, optional notes, a link and a picture — so
 * capturing a thought takes seconds. Turning one into a post or a reel
 * happens in the composer and Magic Design, which receive the idea's text.
 */

import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { ideaSchema, idParamSchema } from '@socialboost/shared';
import { db } from '../../db/client.js';
import { ideas, mediaAssets } from '../../db/schema.js';
import { asyncHandler, requireAuth, validate, withOrganization } from '../../http/middleware.js';
import { badRequest, notFound } from '../../lib/errors.js';

export const ideasRouter: Router = Router();

ideasRouter.use(requireAuth, withOrganization);

async function listIdeas(organizationId: string) {
  return db
    .select({
      id: ideas.id,
      title: ideas.title,
      notes: ideas.notes,
      url: ideas.url,
      status: ideas.status,
      createdAt: ideas.createdAt,
      media: {
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        url: mediaAssets.url,
        thumbnailUrl: mediaAssets.thumbnailUrl,
      },
    })
    .from(ideas)
    .leftJoin(mediaAssets, eq(mediaAssets.id, ideas.mediaAssetId))
    .where(eq(ideas.organizationId, organizationId))
    .orderBy(desc(ideas.createdAt))
    .limit(200);
}

ideasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ ideas: await listIdeas(req.tenant!.organizationId) });
  }),
);

ideasRouter.post(
  '/',
  validate(ideaSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    if (req.body.mediaAssetId) await assertOwnsMedia(organizationId, req.body.mediaAssetId);
    const [created] = await db
      .insert(ideas)
      .values({
        organizationId,
        title: req.body.title.trim(),
        notes: req.body.notes?.trim() || null,
        url: req.body.url?.trim() || null,
        mediaAssetId: req.body.mediaAssetId ?? null,
        createdBy: req.auth!.userId,
      })
      .returning({ id: ideas.id });
    res.status(201).json({ id: created!.id });
  }),
);

ideasRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(ideaSchema.partial()),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    if (req.body.mediaAssetId) await assertOwnsMedia(organizationId, req.body.mediaAssetId);
    const [updated] = await db
      .update(ideas)
      .set({
        ...(req.body.title !== undefined ? { title: req.body.title.trim() } : {}),
        ...(req.body.notes !== undefined ? { notes: req.body.notes?.trim() || null } : {}),
        ...(req.body.url !== undefined ? { url: req.body.url?.trim() || null } : {}),
        ...(req.body.mediaAssetId !== undefined ? { mediaAssetId: req.body.mediaAssetId } : {}),
        ...(req.body.status !== undefined ? { status: req.body.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(ideas.id, String(req.params.id)), eq(ideas.organizationId, organizationId)))
      .returning({ id: ideas.id });
    if (!updated) throw notFound('Idea not found');
    res.json({ id: updated.id });
  }),
);

ideasRouter.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await db
      .delete(ideas)
      .where(and(eq(ideas.id, String(req.params.id)), eq(ideas.organizationId, req.tenant!.organizationId)));
    res.status(204).end();
  }),
);

async function assertOwnsMedia(organizationId: string, mediaAssetId: string): Promise<void> {
  const [asset] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaAssetId), eq(mediaAssets.organizationId, organizationId)))
    .limit(1);
  if (!asset) throw badRequest('That photo was not found in your library.');
}
