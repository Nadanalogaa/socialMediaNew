import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { autofillTemplateSchema, findTemplate, generateCaptionSchema } from '@socialboost/shared';
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
