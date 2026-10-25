import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ASPECT_RATIOS,
  CREATIVE_KINDS,
  autofillTemplateSchema,
  findTemplate,
  briefFromPlan,
  generateCaptionSchema,
  magicStorySchema,
} from '@socialboost/shared';
import {
  asyncHandler,
  requireAuth,
  validate,
  withOrganization,
} from '../../http/middleware.js';
import { db } from '../../db/client.js';
import { brandProfiles } from '../../db/schema.js';
import { badRequest } from '../../lib/errors.js';
import * as gemini from '../../integrations/gemini.js';
import { importImageFromUrl } from '../../integrations/cloudinary.js';
import { firstStockPhotos, searchStockPhotos, stockPhotosConfigured, type StockPhoto } from '../../integrations/pexels.js';
import * as mediaService from '../media/service.js';
import { assertWithinQuota, recordUsage } from '../usage/service.js';
import * as designs from './service.js';

export const creativesRouter: Router = Router();

creativesRouter.use(requireAuth, withOrganization);

/** The tenant's own brand voice, which grounds every generation. */
async function loadBrand(organizationId: string): Promise<gemini.BrandContext> {
  const [brand] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, organizationId))
    .limit(1);

  return brand ?? { name: 'this business' };
}

/** Fills a template's fields from a one-line brief. */
creativesRouter.post(
  '/autofill',
  validate(autofillTemplateSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const template = findTemplate(req.body.templateSlug);
    if (!template) throw badRequest('Unknown template.');

    await assertWithinQuota(organizationId, 'ai_text');
    const brand = await loadBrand(organizationId);

    const values = await gemini.fillTemplateFields(
      brand,
      req.body.brief,
      template.fields
        // Images and colours are chosen, not written.
        .filter((field) => field.type === 'text' || field.type === 'longtext')
        .map((field) => ({
          key: field.key,
          label: field.label,
          maxLength: field.maxLength,
          aiHint: field.aiHint,
        })),
    );

    // Metered only on success, so a failed generation costs nothing.
    await recordUsage(organizationId, 'ai_text', 1, { templateSlug: template.slug });
    res.json({ values });
  }),
);

/** Caption and hashtags for a post. */
creativesRouter.post(
  '/caption',
  validate(generateCaptionSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    await assertWithinQuota(organizationId, 'ai_text');

    const result = await gemini.generateCaption(await loadBrand(organizationId), req.body.brief);
    await recordUsage(organizationId, 'ai_text');
    res.json(result);
  }),
);


/**
 * Magic Design from a plain description: the story is written as scenes and
 * returned as brief text, plus what the user still has to supply.
 */
creativesRouter.post(
  '/magic/story',
  validate(magicStorySchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    await assertWithinQuota(organizationId, 'ai_text');

    const plan = await gemini.writeMagicStory(await loadBrand(organizationId), req.body);
    await recordUsage(organizationId, 'ai_text', 1, { kind: 'magic_story' });

    // Pictures for the scenes that want one: found and imported in parallel,
    // so the story arrives with photos already in place. Any miss leaves the
    // scene for the user to fill; it never fails the story.
    const photoScenes = await Promise.all(
      plan.scenes.flatMap((scene, index) => {
        if (!scene.photo) return [];
        const query = scene.imageQuery || scene.headline;
        return [
          (async () => {
            const alternatives = stockPhotosConfigured() ? await firstStockPhotos(query) : [];
            const first = alternatives[0];
            const chosen = first ? await importStockPhoto(organizationId, first).catch(() => null) : null;
            return { index, query, chosen, alternatives };
          })(),
        ];
      }),
    );

    res.json({
      title: plan.title,
      language: plan.language,
      brief: briefFromPlan(plan),
      needs: { photoScenes: photoScenes.map((scene) => scene.index) },
      photoScenes,
    });
  }),
);

/** A stock photo becomes a library asset of the tenant's own. */
async function importStockPhoto(organizationId: string, photo: StockPhoto) {
  const imported = await importImageFromUrl(organizationId, photo.url);
  return mediaService.registerMedia(organizationId, {
    kind: 'image',
    url: imported.url,
    width: imported.width ?? photo.width,
    height: imported.height ?? photo.height,
    bytes: imported.bytes ?? undefined,
    source: 'pexels',
    providerRef: photo.id,
  });
}

const stockSearchSchema = z.object({
  query: z.string().min(2).max(80),
  page: z.number().int().min(1).max(10).optional(),
});

/** Alternatives for a scene, hot-linked for the chooser only. */
creativesRouter.post(
  '/magic/photos',
  validate(stockSearchSchema),
  asyncHandler(async (req, res) => {
    if (!stockPhotosConfigured()) {
      res.json({ photos: [], configured: false });
      return;
    }
    const photos = await searchStockPhotos(req.body.query, { perPage: 12, page: req.body.page });
    res.json({ photos, configured: true });
  }),
);

const stockPickSchema = z.object({
  id: z.string().max(40),
  url: z.string().url(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  photographer: z.string().max(200).optional(),
  photographerUrl: z.string().max(500).optional(),
  alt: z.string().max(500).optional(),
});

/** The user chose a stock photo: import it so it behaves like an upload. */
creativesRouter.post(
  '/magic/photos/pick',
  validate(stockPickSchema),
  asyncHandler(async (req, res) => {
    const asset = await importStockPhoto(req.tenant!.organizationId, {
      ...req.body,
      width: req.body.width ?? 0,
      height: req.body.height ?? 0,
      thumbnailUrl: req.body.url,
      photographer: req.body.photographer ?? '',
      photographerUrl: req.body.photographerUrl ?? '',
      alt: req.body.alt ?? '',
      source: 'pexels',
    });
    res.status(201).json(asset);
  }),
);

// --- Saved designs --------------------------------------------------------

const saveDesignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  kind: z.enum(CREATIVE_KINDS),
  ratio: z.enum(Object.keys(ASPECT_RATIOS) as [string, ...string[]]),
  /** The whole editable document; its shape is the editor's concern. */
  document: z.record(z.string(), z.unknown()),
  shortDescription: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  renderedAssetId: z.string().uuid().optional(),
});

creativesRouter.get(
  '/designs',
  asyncHandler(async (req, res) => {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    res.json({
      designs: await designs.listDesigns(req.tenant!.organizationId, {
        kind: kind === 'image' || kind === 'video' ? kind : undefined,
        tag,
      }),
      tags: await designs.listTags(req.tenant!.organizationId),
    });
  }),
);

creativesRouter.post(
  '/designs',
  validate(saveDesignSchema),
  asyncHandler(async (req, res) => {
    const design = await designs.saveDesign(
      req.tenant!.organizationId,
      req.auth!.userId,
      req.body,
    );
    res.status(req.body.id ? 200 : 201).json(design);
  }),
);

creativesRouter.get(
  '/designs/:id',
  asyncHandler(async (req, res) => {
    res.json(await designs.getDesign(req.tenant!.organizationId, String(req.params.id)));
  }),
);

creativesRouter.delete(
  '/designs/:id',
  asyncHandler(async (req, res) => {
    await designs.deleteDesign(req.tenant!.organizationId, String(req.params.id));
    res.status(204).end();
  }),
);

// --- Magic Design briefs ---------------------------------------------------

const saveBriefSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().max(200),
  brief: z.string().min(1).max(20000),
  scenePhotos: z
    .record(z.string(), z.union([z.string().url(), z.array(z.string().url()).max(8)]))
    .default({}),
  options: z
    .object({
      photoLayout: z.record(z.string(), z.enum(['background', 'blocks'])).optional(),
      logo: z.string().url().optional(),
      logoPosition: z.string().max(20).optional(),
      description: z.string().max(4000).optional(),
    })
    .default({}),
  brandColor: z.string().max(32),
  accentColor: z.string().max(32),
});

creativesRouter.get(
  '/briefs',
  asyncHandler(async (req, res) => {
    res.json({ briefs: await designs.listBriefs(req.tenant!.organizationId) });
  }),
);

creativesRouter.post(
  '/briefs',
  validate(saveBriefSchema),
  asyncHandler(async (req, res) => {
    const brief = await designs.saveBrief(req.tenant!.organizationId, req.auth!.userId, req.body);
    res.status(req.body.id ? 200 : 201).json(brief);
  }),
);

creativesRouter.delete(
  '/briefs/:id',
  asyncHandler(async (req, res) => {
    await designs.deleteBrief(req.tenant!.organizationId, String(req.params.id));
    res.status(204).end();
  }),
);
