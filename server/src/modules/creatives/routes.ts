import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ASPECT_RATIOS,
  CREATIVE_KINDS,
  autofillTemplateSchema,
  findTemplate,
  generateCaptionSchema,
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
