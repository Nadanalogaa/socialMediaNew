/**
 * Free stock photos, so a reel written from a description comes with pictures
 * already in place. Pixabay is used when its key is set, else Pexels. Both
 * licences allow commercial use without attribution; Pixabay asks that images
 * be stored rather than hot-linked, which the Cloudinary import does anyway.
 */

import { env } from '../lib/env.js';
import { serviceUnavailable, tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export type StockSource = 'pixabay' | 'pexels';

export interface StockPhoto {
  id: string;
  /** Large enough for a 1080×1920 scene. */
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
  source: StockSource;
}

export function stockPhotoSource(): StockSource | null {
  if (env.PIXABAY_API_KEY) return 'pixabay';
  if (env.PEXELS_API_KEY) return 'pexels';
  return null;
}

export function stockPhotosConfigured(): boolean {
  return stockPhotoSource() !== null;
}

interface SearchOptions {
  perPage?: number;
  page?: number;
}

/** Portrait photos for a short query, best match first. */
export async function searchStockPhotos(query: string, options: SearchOptions = {}): Promise<StockPhoto[]> {
  const source = stockPhotoSource();
  if (!source) throw serviceUnavailable('Stock photos are not configured on this server.');
  return source === 'pixabay' ? searchPixabay(query, options) : searchPexels(query, options);
}

/** Words that say where a picture belongs, not what is in it. */
const PLACE_WORDS = /^(india|indian|south|north|tamil|tamilnadu|chennai|madurai|coimbatore|trichy|salem|kerala|kochi|mumbai|delhi|bengaluru|bangalore|hyderabad|kolkata|pune|goa|rajasthan|punjab|gujarat|karnataka|andhra|telangana)$/i;

/** Words that make a search vaguer without saying what is in the picture. */
const FILLER_WORDS = /^(a|an|the|of|with|and|for|in|on|at|to|from|our|your|happy|smiling|modern|front|view|beautiful|best|new|fresh|top|close|closeup|up|shot|photo|image|picture|evening|morning|guiding|treating|sharing|showing|serviced)$/i;

function subjectWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 2 && !PLACE_WORDS.test(w) && !FILLER_WORDS.test(w));
}

const mentionsIndia = (photo: StockPhoto) => /\bindia|indian\b|tamil|kerala|chennai|bangalore|mumbai|delhi|hindu|saree|sari/i.test(photo.alt);

const stem = (word: string) => word.replace(/(ing|es|s)$/, '');

/**
 * How many subject words a photo's tags carry, as whole words: "sweets"
 * matches the tag "sweets" or "indian sweet", never "sweet love".
 * Where a tag has several words, the subject word must be its main noun.
 */
function subjectScore(photo: StockPhoto, subject: string[]): number {
  const tags = photo.alt.toLowerCase().split(/\s*,\s*/).filter(Boolean);
  return subject.reduce((total, word) => {
    const hit = tags.some((tag) => {
      const words = tag.split(/\s+/);
      const last = words[words.length - 1]!;
      // The last word of a tag is what it names: "indian sweet" is a sweet, "sweet love" is not.
      return last === word || stem(last) === stem(word);
    });
    return total + (hit ? 1 : 0);
  }, 0);
}

/** On topic: shows the business, or matches every word of its own scene. */
function onTopic(photo: StockPhoto, subject: string[], anchor: string[]): boolean {
  if (anchor.length === 0) return subjectScore(photo, subject) > 0;
  return subjectScore(photo, anchor) > 0 || (subject.length >= 2 && subjectScore(photo, subject) >= Math.min(2, subject.length));
}

/**
 * Pictures for one scene, most relevant first.
 *
 * What the picture shows decides: a photo must carry at least one of the
 * query's subject words in its tags, or it is not used at all — a colour
 * background beats a wrong picture. Among relevant photos, ones from India
 * come first when the query asks for India. Searches are short, because
 * stock libraries match long queries badly: "indian dentist", then
 * "dentist", then the main noun alone.
 */
export async function firstStockPhotos(query: string, count = 6, topic?: string): Promise<StockPhoto[]> {
  const subject = subjectWords(query);
  if (subject.length === 0) return [];
  // What the whole business is about: a photo must show it, whatever the scene.
  const anchor = topic ? subjectWords(topic) : [];
  const wantsIndia = /\b(indian|india)\b/i.test(query) || query.toLowerCase().split(/\s+/).some((w) => PLACE_WORDS.test(w));
  const core = subject.slice(0, 3).join(' ');
  const searches = [
    ...(wantsIndia ? [`indian ${core}`] : []),
    core,
    ...(subject.length > 1 ? [subject.slice(-1)[0]!, subject[0]!] : []),
  ].filter((q, i, all) => all.indexOf(q) === i);

  const seen = new Map<string, StockPhoto>();
  for (const search of searches) {
    try {
      for (const photo of await searchStockPhotos(search, { perPage: 20 })) if (!seen.has(photo.id)) seen.set(photo.id, photo);
    } catch (error) {
      logger.warn({ err: error, query: search }, 'Stock photo lookup skipped');
    }
    const relevant = [...seen.values()].filter((p) => onTopic(p, subject, anchor));
    if (relevant.length >= count && (!wantsIndia || relevant.some(mentionsIndia))) break;
  }

  const ranked = (pool: StockPhoto[]) => pool
    .map((photo, order) => ({ photo, order, score: subjectScore(photo, subject) + 2 * subjectScore(photo, anchor) }))
    .filter((entry) => entry.score > 0 && onTopic(entry.photo, subject, anchor))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (wantsIndia ? Number(mentionsIndia(b.photo)) - Number(mentionsIndia(a.photo)) : 0) ||
        a.order - b.order,
    )
    .map((entry) => entry.photo);

  let result = ranked([...seen.values()]);
  if (result.length === 0 && anchor.length > 0) {
    // The scene's own words found nothing on topic: the business subject alone.
    const fallback = `${wantsIndia ? 'indian ' : ''}${anchor.join(' ')}`;
    try {
      for (const photo of await searchStockPhotos(fallback, { perPage: 20 })) if (!seen.has(photo.id)) seen.set(photo.id, photo);
    } catch (error) {
      logger.warn({ err: error, query: fallback }, 'Stock photo lookup skipped');
    }
    result = ranked([...seen.values()]);
  }
  return result.slice(0, count);
}

function failed(source: StockSource, status: number, query: string): never {
  if (status === 429) throw tooManyRequests('The photo service is busy right now. Try again in a minute.');
  logger.warn({ source, status, query }, 'Stock photo search failed');
  throw serviceUnavailable('Could not reach the photo service.');
}

// --- Pixabay -----------------------------------------------------------------

interface PixabayHit {
  id: number;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  pageURL: string;
  tags: string;
}

async function searchPixabay(query: string, options: SearchOptions): Promise<StockPhoto[]> {
  const params = new URLSearchParams({
    key: env.PIXABAY_API_KEY!,
    q: query.slice(0, 100),
    image_type: 'photo',
    orientation: 'vertical',
    safesearch: 'true',
    // Pixabay rejects per_page under 3.
    per_page: String(Math.max(3, options.perPage ?? 8)),
    page: String(options.page ?? 1),
  });
  const response = await fetch(`https://pixabay.com/api/?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) failed('pixabay', response.status, query);
  const data = (await response.json()) as { hits?: PixabayHit[] };
  return (data.hits ?? []).map((hit) => ({
    id: String(hit.id),
    url: hit.largeImageURL,
    thumbnailUrl: hit.webformatURL,
    width: hit.imageWidth,
    height: hit.imageHeight,
    photographer: hit.user,
    photographerUrl: hit.pageURL,
    alt: hit.tags,
    source: 'pixabay' as const,
  }));
}

// --- Pexels ------------------------------------------------------------------

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: { large2x: string; large: string; medium: string; portrait: string };
}

async function searchPexels(query: string, options: SearchOptions): Promise<StockPhoto[]> {
  const params = new URLSearchParams({
    query,
    orientation: 'portrait',
    per_page: String(options.perPage ?? 8),
    page: String(options.page ?? 1),
  });
  const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: env.PEXELS_API_KEY! },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) failed('pexels', response.status, query);
  const data = (await response.json()) as { photos?: PexelsPhoto[] };
  return (data.photos ?? []).map((photo) => ({
    id: String(photo.id),
    url: photo.src.large2x || photo.src.large,
    thumbnailUrl: photo.src.medium,
    width: photo.width,
    height: photo.height,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    alt: photo.alt ?? '',
    source: 'pexels' as const,
  }));
}
