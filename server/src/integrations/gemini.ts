/**
 * Marketing copy grounded in the tenant's own brand profile.
 *
 * Every prompt is built from the brand kit, so the same request produces
 * different words for different businesses. The model behind it is whichever
 * free provider is configured (see ai.ts).
 */

import { PARTICLE_EFFECTS, readEffectName, type MagicStoryPlan, type StoryScene } from '@socialboost/shared';
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

// --- Magic Design stories --------------------------------------------------

const STORY_SHAPE = `{
  "title": "a short name for this reel, under 60 characters",
  "language": "the language the lines are written in",
  "footer": "the website and the phone number from the allowed contact details, separated by · , without the words phone/email/website; empty string if there are none",
  "scenes": [
    {
      "label": "what this scene is for, 1-3 words, e.g. Opening, What we offer, Proof, Offer, Call to action",
      "headline": "the one line that carries the scene, under 50 characters",
      "headlineStyle": ["0-3 words from: bold, huge, big, caps, gap, pop, rise, fade, letters, wave, typewriter, yellow, gold, orange, green, blue, pink, white, cream"],
      "body": ["0-3 supporting lines, each under 60 characters"],
      "contact": ["0-2 contact lines, only on the final scene, only from the allowed contact details"],
      "photo": true,
      "imageQuery": "when photo is true: 2-4 English words for a stock photo that fits the scene, e.g. bharatanatyam dancer stage, children music class, cake shop counter",
      "replacePhoto": "only when revising and the instruction asks for a different picture on this scene: true, with a new imageQuery for the picture wanted (e.g. indian man taxi driver)",
      "effect": "only when the instruction asks for an effect, particles, sparkle, celebration or mood: one of ${PARTICLE_EFFECTS.join(', ')}"
    }
  ]
}`;

const STORY_RULES = [
  'You are a video storyteller for small businesses. You write short vertical reels (15-30 seconds) as a sequence of scenes.',
  'Story arc: hook the viewer, say who the business is, what it offers, why to trust it (years, students, awards, results that the description gives), then the offer or invitation, then a closing call to action with contact details.',
  'Every line must be short enough to read in a glance. Each body line is a separate line on screen, never a paragraph.',
  'Set "photo": true on scenes that would be stronger with a real picture of the business (people, place, work); not on the pure text scenes.',
  'Every imageQuery must carry the place, culture and style the description asks for: "use Indian hotel images" gives "indian hotel lobby", a business in Chennai gives "south indian ..." or "indian ...". Never a generic western scene when the business is in India.',
  'Use only the facts in the description and the allowed contact details. Never invent fees, dates, numbers, counts (students, batches, branches), awards, phone numbers or addresses. If the description gives no number for something, say it without a number ("experienced teachers", not "500 students"). Proof scenes use only the proof the description gives.',
  'Write every headline and body line in the language asked for, not in English, unless English is asked for. Tamil, Hindi, Telugu, Kannada and Malayalam are written in their own script. "Tanglish" is spoken Tamil in Latin letters mixed with English words, the way people text — for example "Unga kuzhandhaikku Bharatanatyam kattrukka vaanga!" or "Free demo class indha Saturday". Keep brand names, numbers and contact details as given.',
  'Return only the JSON object, nothing else.',
].join('\n');

/** "phone 98765 43210" → "98765 43210": the labels come from our own instruction, not the user. */
function cleanContactLine(line: string): string {
  return line
    .split(/\s*[·|•]\s*/)
    .map((part) => part.replace(/^(phone|mobile|call|whatsapp|email|e-mail|website|web|site)\s*[:\-]?\s*/i, '').trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * A line is kept only if every number in it was given by the user: a count
 * the model made up ("Thousands of students") is worse than no line.
 */
function statedInSource(line: string, source: string): boolean {
  const digits = line.match(/\d[\d,]*\+?/g) ?? [];
  const words = line.match(/\b(hundreds?|thousands?|lakhs?|crores?|millions?)\b/gi) ?? [];
  const haystack = source.toLowerCase();
  return (
    digits.every((n) => haystack.includes(n.replace(/[,+]/g, '').toLowerCase()) || haystack.includes(n.toLowerCase())) &&
    words.every((w) => haystack.includes(w.toLowerCase()))
  );
}

/**
 * Words about where and how the pictures should look, read from what the user
 * wrote: an explicit "use X images", or the country and region the business
 * is in. Stock libraries default to western scenes without them.
 */
const INDIAN_PLACES = /\b(india|indian|chennai|madras|tamil|tamilnadu|tamil nadu|coimbatore|madurai|trichy|salem|bengaluru|bangalore|hyderabad|mumbai|delhi|kolkata|pune|kerala|kochi|karnataka|andhra|telangana|gujarat|rajasthan|punjab)\b/i;
const SOUTH_INDIAN = /\b(south indian|chennai|madras|tamil|coimbatore|madurai|trichy|salem|kerala|kochi|bengaluru|bangalore|hyderabad|andhra|telangana|karnataka)\b/i;

export function photoStyleWords(text: string): string[] {
  const explicit = /\b(?:use|with|show|add)\s+(?:only\s+)?([a-z\s-]{3,40}?)\s+(?:images?|photos?|pictures?|pics)\b/i.exec(text);
  if (explicit) {
    const words = explicit[1]!.toLowerCase().split(/\s+/).filter((w) => /^(indian|south|north|tamil|kerala|rajasthani|punjabi|bengali|traditional|modern|luxury|village|rural|urban)$/.test(w));
    if (words.length > 0) return words;
  }
  if (SOUTH_INDIAN.test(text)) return ['south', 'indian'];
  if (INDIAN_PLACES.test(text)) return ['indian'];
  return [];
}

function withStyle(query: string, style: string[]): string {
  const lower = query.toLowerCase();
  const missing = style.filter((word) => !lower.includes(word));
  // "south indian" is one idea: add it whole or not at all.
  if (style.join(' ') === 'south indian' && lower.includes('indian')) return query;
  return missing.length > 0 ? `${missing.join(' ')} ${query}` : query;
}

export interface StoryRequest {
  description: string;
  sceneCount?: number;
  language?: string;
  currentBrief?: string;
  instruction?: string;
}

/**
 * Writes (or revises) the scenes of a reel from a plain description of the
 * business. The result is validated and clamped before it becomes a brief.
 */
export async function writeMagicStory(brand: BrandContext, input: StoryRequest): Promise<MagicStoryPlan> {
  const count = input.sceneCount ?? 5;
  const language = input.language?.trim() || 'English';
  const task = input.currentBrief && input.instruction
    ? [
        `Here is the current reel, scene by scene:\n${input.currentBrief}`,
        `The business described itself as: "${input.description}"`,
        `Revise the reel according to this instruction: "${input.instruction}". Keep everything the instruction does not touch, including the scene count unless it asks otherwise. If the instruction is about the pictures or images, keep the words and instead set "replacePhoto": true with a new "imageQuery" on each scene it concerns (every photo scene when it says all images). If it asks for effects or particles, set "effect" on the scenes it concerns (all scenes when it does not say which). A scene already has an "Effect:" line when the reel shows one; keep it unless asked.`,
      ]
    : [
        `The business described itself as: "${input.description}"`,
        `Write a reel of exactly ${count} scenes in ${language}.`,
      ];
  task.push(`Return JSON in exactly this shape:\n${STORY_SHAPE}`);

  const text = await generateText(`${brandInstruction(brand)}\n${STORY_RULES}`, task.join('\n\n'), { json: true });
  const raw = parseJson<Partial<MagicStoryPlan>>(text);
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .filter((scene): scene is StoryScene => !!scene && typeof scene === 'object' && typeof (scene as StoryScene).headline === 'string')
    .slice(0, 8)
    .map((scene) => ({
      label: typeof scene.label === 'string' ? scene.label.slice(0, 40) : undefined,
      headline: scene.headline.slice(0, 90),
      headlineStyle: Array.isArray(scene.headlineStyle) ? scene.headlineStyle.filter((w): w is string => typeof w === 'string').slice(0, 3) : [],
      body: (Array.isArray(scene.body) ? scene.body : []).filter((l): l is string => typeof l === 'string').slice(0, 3).map((l) => l.slice(0, 120)),
      contact: (Array.isArray(scene.contact) ? scene.contact : []).filter((l): l is string => typeof l === 'string').slice(0, 2).map((l) => cleanContactLine(l).slice(0, 120)),
      photo: scene.photo === true,
      imageQuery: typeof scene.imageQuery === 'string' ? scene.imageQuery.trim().slice(0, 60) : undefined,
      replacePhoto: scene.replacePhoto === true,
      effect: typeof scene.effect === 'string' ? readEffectName(scene.effect) : undefined,
    }));
  if (scenes.length < 2) throw new Error('The AI did not return enough scenes. Please try again.');

  const style = photoStyleWords(`${input.description}\n${input.instruction ?? ''}\n${brand.description ?? ''}`);
  for (const scene of scenes) if (scene.photo && scene.imageQuery) scene.imageQuery = withStyle(scene.imageQuery, style);

  const source = [input.description, input.currentBrief ?? '', input.instruction ?? '', brand.phone ?? '', brand.website ?? '', brand.email ?? '', brand.description ?? '']
    .join('\n')
    .replace(/[,\s]+/g, ' ');
  for (const scene of scenes) scene.body = scene.body.filter((line) => statedInSource(line, source));

  // Contact details are copied from the brand kit, never typed by the model:
  // a digit or a letter wrong in a phone number or a website is worse than none.
  const contacts = [brand.website, brand.phone, brand.email].filter((v): v is string => Boolean(v && v.trim()));
  const normalise = (v: string) => v.toLowerCase().replace(/[\s\-()]/g, '');
  const isKnownContact = (line: string) => contacts.some((c) => normalise(line).includes(normalise(c)));
  for (const scene of scenes) scene.contact = scene.contact.filter(isKnownContact);
  if (contacts.length > 0) {
    const last = scenes[scenes.length - 1]!;
    if (last.contact.length === 0) last.contact = contacts.slice(0, 2);
  }
  const footer = contacts.length > 0 ? [brand.website, brand.phone].filter(Boolean).join(' · ') : undefined;

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : scenes[0]!.headline,
    language: typeof raw.language === 'string' ? raw.language.slice(0, 40) : language,
    footer,
    scenes,
  };
}
