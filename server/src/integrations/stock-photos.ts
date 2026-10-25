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

/** The first results for a query, or none; a miss must not fail the story. */
export async function firstStockPhotos(query: string, count = 6): Promise<StockPhoto[]> {
  try {
    return await searchStockPhotos(query, { perPage: count });
  } catch (error) {
    logger.warn({ err: error, query }, 'Stock photo lookup skipped');
    return [];
  }
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
