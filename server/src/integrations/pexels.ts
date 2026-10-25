/**
 * Free stock photos from Pexels, so a reel written from a description comes
 * with pictures already in place. The Pexels licence allows commercial use
 * without attribution; their API guidelines ask for a visible "Photos by
 * Pexels" credit, which the chooser shows.
 */

import { env } from '../lib/env.js';
import { serviceUnavailable, tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

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
  source: 'pexels';
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: { large2x: string; large: string; medium: string; portrait: string };
}

export function stockPhotosConfigured(): boolean {
  return Boolean(env.PEXELS_API_KEY);
}

/** Portrait photos for a short query, best match first. */
export async function searchStockPhotos(query: string, options: { perPage?: number; page?: number } = {}): Promise<StockPhoto[]> {
  if (!env.PEXELS_API_KEY) throw serviceUnavailable('Stock photos are not configured on this server.');
  const params = new URLSearchParams({
    query,
    orientation: 'portrait',
    per_page: String(options.perPage ?? 8),
    page: String(options.page ?? 1),
  });
  const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: env.PEXELS_API_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) throw tooManyRequests('The photo service is busy right now. Try again in a minute.');
  if (!response.ok) {
    logger.warn({ status: response.status, query }, 'Pexels search failed');
    throw serviceUnavailable('Could not reach the photo service.');
  }
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
    source: 'pexels',
  }));
}

/** The first result for a query, or nothing; a miss must not fail the story. */
export async function firstStockPhotos(query: string, count = 6): Promise<StockPhoto[]> {
  try {
    return await searchStockPhotos(query, { perPage: count });
  } catch (error) {
    logger.warn({ err: error, query }, 'Stock photo lookup skipped');
    return [];
  }
}
