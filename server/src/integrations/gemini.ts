/**
 * Gemini content generation.
 *
 * Every prompt is grounded in the tenant's own brand profile. The previous
 * app hardcoded one business into every system instruction, which is exactly
 * what made it unusable for anyone else.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../lib/env.js';
import { AppError, serviceUnavailable, tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const MODEL = 'gemini-2.5-flash';

/**
 * Turns a Gemini failure into something the caller can act on.
 *
 * A quota or key problem is a configuration fact, not a bug in this service,
 * and reporting it as a generic 500 hides the one thing worth knowing.
 */
function toAppError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429')) {
    return tooManyRequests(
      'The AI service has no quota left on this API key. Check the Gemini key\'s usage limits and billing.',
    );
  }
  if (message.includes('API_KEY_INVALID') || message.includes('"code":401') || message.includes('"code":403')) {
    return serviceUnavailable('The Gemini API key was rejected. Check GEMINI_API_KEY.');
  }

  logger.error({ err: error }, 'Unexpected Gemini failure');
  return serviceUnavailable('The AI service is unavailable right now. Please try again shortly.');
}

/** Runs a Gemini call, mapping provider failures to typed errors. */
async function callGemini<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toAppError(error);
  }
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw serviceUnavailable('AI features are not configured on this server.');
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export interface BrandContext {
  name: string;
  website?: string | null;
  industry?: string | null;
  description?: string | null;
  toneOfVoice?: string | null;
  targetAudience?: string | null;
}

/** Turns a brand profile into the system instruction for every generation. */
export function brandInstruction(brand: BrandContext): string {
  const parts = [
    `You write marketing copy for "${brand.name}".`,
    brand.industry ? `The business is in: ${brand.industry}.` : null,
    brand.description ? `About the business: ${brand.description}` : null,
    brand.targetAudience ? `Its customers are: ${brand.targetAudience}` : null,
    brand.toneOfVoice ? `Write in this tone: ${brand.toneOfVoice}` : null,
    'Write plainly and specifically. Avoid cliché marketing language, exclamation marks and emoji unless asked.',
    'Respect every length limit exactly — text that overflows its space is unusable.',
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Fills a template's fields from a one-line brief.
 *
 * The response schema is built from the template's own fields, so the model
 * can only return keys that exist and the result needs no post-validation.
 */
export async function fillTemplateFields(
  brand: BrandContext,
  brief: string,
  fields: { key: string; label: string; maxLength?: number; aiHint?: string }[],
): Promise<Record<string, string>> {
  const properties = Object.fromEntries(
    fields.map((field) => [
      field.key,
      {
        type: Type.STRING,
        description: [
          field.label,
          field.aiHint,
          field.maxLength ? `Maximum ${field.maxLength} characters.` : null,
        ]
          .filter(Boolean)
          .join(' '),
      },
    ]),
  );

  const response = await callGemini(() =>
    getClient().models.generateContent({
      model: MODEL,
      contents: `Write the text for this ad: "${brief}"`,
    config: {
      systemInstruction: brandInstruction(brand),
      responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties,
          required: fields.map((field) => field.key),
        },
      },
    }),
  );

  const text = response.text;
  if (!text) throw new Error('The AI returned an empty response.');

  const parsed = JSON.parse(text) as Record<string, string>;

  // Enforce the limits ourselves: the model treats them as guidance.
  for (const field of fields) {
    const value = parsed[field.key];
    if (typeof value !== 'string') {
      delete parsed[field.key];
    } else if (field.maxLength && value.length > field.maxLength) {
      logger.debug({ field: field.key, length: value.length }, 'Trimming overlong AI field');
      parsed[field.key] = value.slice(0, field.maxLength).trimEnd();
    }
  }

  return parsed;
}

/** Captions for a post, written per platform. */
export async function generateCaption(
  brand: BrandContext,
  brief: string,
): Promise<{ caption: string; hashtags: string[] }> {
  const response = await callGemini(() =>
    getClient().models.generateContent({
      model: MODEL,
      contents: `Write a social media post about: "${brief}"`,
      config: {
        systemInstruction: brandInstruction(brand),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caption: {
              type: Type.STRING,
              description: 'The post text. Two or three short sentences, under 400 characters.',
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '5 to 8 relevant hashtags, without the # symbol.',
            },
          },
          required: ['caption', 'hashtags'],
        },
      },
    }),
  );

  const text = response.text;
  if (!text) throw new Error('The AI returned an empty response.');
  return JSON.parse(text) as { caption: string; hashtags: string[] };
}

/** A short, warm reply to a Google review, in the business's own voice. */
export async function suggestReviewReply(
  brand: BrandContext,
  review: { reviewer: string; rating: number; comment: string },
): Promise<string> {
  const response = await callGemini(() =>
    getClient().models.generateContent({
      model: MODEL,
      contents: [
        `Write a reply from the business owner to this Google review.`,
        `Reviewer: ${review.reviewer}. Rating: ${review.rating} out of 5.`,
        `Review text: "${review.comment || '(no text, rating only)'}"`,
        review.rating >= 4
          ? 'Thank them specifically for what they praised, invite them back, keep it to two or three sentences.'
          : 'Apologise sincerely without excuses, acknowledge the specific issue, offer to put it right and give a way to contact the owner directly, keep it to three or four sentences.',
        'No hashtags, no emojis beyond one at most, no generic marketing. Plain text only.',
      ].join('\n'),
      config: { systemInstruction: brandInstruction(brand) },
    }),
  );
  const text = response.text?.trim();
  if (!text) throw new Error('The AI returned an empty response.');
  return text;
}

/** A reply to a comment under a post, matching how the brand speaks. */
export async function suggestCommentReply(
  brand: BrandContext,
  comment: { authorName: string; message: string; postCaption: string },
): Promise<string> {
  const response = await callGemini(() =>
    getClient().models.generateContent({
      model: MODEL,
      contents: [
        `Write a reply to this comment on the business's social media post.`,
        `Post: "${comment.postCaption.slice(0, 300)}"`,
        `Comment by ${comment.authorName}: "${comment.message}"`,
        'One or two sentences. If they ask about price, timing or availability, answer helpfully and invite them to message or call. Friendly, not salesy. Plain text, at most one emoji.',
      ].join('\n'),
      config: { systemInstruction: brandInstruction(brand) },
    }),
  );
  const text = response.text?.trim();
  if (!text) throw new Error('The AI returned an empty response.');
  return text;
}
