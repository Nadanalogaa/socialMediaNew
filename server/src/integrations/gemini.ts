/**
 * Marketing copy grounded in the tenant's own brand profile.
 *
 * Every prompt is built from the brand kit, so the same request produces
 * different words for different businesses. The model behind it is whichever
 * free provider is configured (see ai.ts).
 */

import { generateText, parseJson } from './ai.js';

export interface BrandContext {
  name: string;
  phone?: string | null;
  email?: string | null;
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
  const contact = [
    brand.phone ? `phone ${brand.phone}` : null,
    brand.email ? `email ${brand.email}` : null,
    brand.website ? `website ${brand.website}` : null,
  ].filter(Boolean);
  parts.push(
    contact.length > 0
      ? `The only contact details you may mention are: ${contact.join(', ')}.`
      : 'You do not know any phone number, email or address for the business; invite people to message the page instead.',
    'Use every fact the request gives you (offers, discounts, dates, names) exactly as given. Do not add facts of your own: no prices, fees, timings, phone numbers, emails or addresses beyond what is given above or in the request. When a reader asks for a detail you were not given, say the team will share it by message — and still complete the task.',
  );
  return parts.filter(Boolean).join('\n');
}

/**
 * Fills a template's text fields from a one-line brief. The field keys are
 * echoed back as JSON keys, so the result needs no mapping.
 */
export async function fillTemplateFields(
  brand: BrandContext,
  brief: string,
  fields: { key: string; label: string; maxLength?: number; aiHint?: string }[],
): Promise<Record<string, string>> {
  const spec = fields
    .map((f) => `- "${f.key}": ${f.label}${f.aiHint ? ` — ${f.aiHint}` : ''}${f.maxLength ? ` (max ${f.maxLength} characters)` : ''}`)
    .join('\n');
  const text = await generateText(
    brandInstruction(brand),
    `Fill in the text for an advertisement about: "${brief}".\nReturn a JSON object with exactly these keys:\n${spec}\nKeep each value within its limit. No extra keys.`,
    { json: true },
  );
  const parsed = parseJson<Record<string, unknown>>(text);
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = parsed[f.key];
    if (typeof v === 'string') out[f.key] = f.maxLength ? v.slice(0, f.maxLength) : v;
  }
  return out;
}

/** A caption and hashtags for a post. */
export async function generateCaption(
  brand: BrandContext,
  brief: string,
): Promise<{ caption: string; hashtags: string[] }> {
  const text = await generateText(
    brandInstruction(brand),
    `Write a social media post about: "${brief}".\nReturn JSON: {"caption": "two or three short sentences, under 400 characters", "hashtags": ["5 to 8 relevant hashtags without the # symbol"]}`,
    { json: true },
  );
  const parsed = parseJson<{ caption?: string; hashtags?: unknown }>(text);
  return {
    caption: typeof parsed.caption === 'string' ? parsed.caption : '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.filter((h): h is string => typeof h === 'string').map((h) => h.replace(/^#/, '')) : [],
  };
}

/** A short, warm reply to a Google review, in the business's own voice. */
export async function suggestReviewReply(
  brand: BrandContext,
  review: { reviewer: string; rating: number; comment: string },
): Promise<string> {
  return generateText(
    brandInstruction(brand),
    [
      'Write a reply from the business owner to this Google review.',
      `Reviewer: ${review.reviewer}. Rating: ${review.rating} out of 5.`,
      `Review text: "${review.comment || '(no text, rating only)'}"`,
      review.rating >= 4
        ? 'Thank them specifically for what they praised, invite them back, keep it to two or three sentences.'
        : 'Apologise sincerely without excuses, acknowledge the specific issue, offer to put it right and give a way to contact the owner directly, keep it to three or four sentences.',
      'No hashtags, at most one emoji, no generic marketing. Plain text only, no quotation marks around the reply.',
    ].join('\n'),
  );
}

/** A reply to a comment under a post, matching how the brand speaks. */
export async function suggestCommentReply(
  brand: BrandContext,
  comment: { authorName: string; message: string; postCaption: string },
): Promise<string> {
  return generateText(
    brandInstruction(brand),
    [
      "Write a reply to this comment on the business's social media post.",
      `Post: "${comment.postCaption.slice(0, 300)}"`,
      `Comment by ${comment.authorName}: "${comment.message}"`,
      'One or two sentences. If they ask about price, timing or availability, answer helpfully and invite them to message or call. Friendly, not salesy. Plain text, at most one emoji, no quotation marks around the reply.',
    ].join('\n'),
  );
}

// --- Templates: what ✨ gives when no AI provider is configured ----------------------

export function templateReviewReply(brand: BrandContext, review: { reviewer: string; rating: number; comment: string }): string {
  const first = review.reviewer.split(' ')[0] || 'there';
  if (review.rating >= 4) {
    return `Thank you so much, ${first}! It means a lot to all of us at ${brand.name} that you took the time to share this. We look forward to welcoming you again soon.`;
  }
  if (review.rating === 3) {
    return `Thank you for your honest feedback, ${first}. We're glad some things went well and sorry others fell short — we'd like to make it right. Please message us directly so we can hear more and improve.`;
  }
  return `We're truly sorry, ${first} — this is not the experience we want anyone to have at ${brand.name}. Please contact us directly so we can understand what happened and put it right. Thank you for telling us.`;
}

export function templateCommentReply(brand: BrandContext, comment: { authorName: string; message: string }): string {
  const first = comment.authorName.split(' ')[0] || 'there';
  const m = comment.message.toLowerCase();
  if (/fee|price|cost|charge|rate|how much/.test(m)) {
    return `Hi ${first}, thank you for asking! Please message us and we'll send the details and timings right away. 😊`;
  }
  if (/timing|time|schedule|when|batch|class/.test(m)) {
    return `Hi ${first}! We have batches through the week — message us with your preference and we'll find one that suits you.`;
  }
  if (/address|where|location|near/.test(m)) {
    return `Hi ${first}, we'd love to see you — message us and we'll share the exact location and directions.`;
  }
  return `Thank you, ${first}! 😊 Feel free to message us if you'd like to know more about ${brand.name}.`;
}
