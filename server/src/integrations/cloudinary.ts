/**
 * Cloudinary: signed direct uploads and delivery transformations.
 *
 * Media never passes through this server. The client asks for a signature,
 * uploads straight to Cloudinary, then registers the resulting URL. That keeps
 * the API process small and lets large videos upload in chunks without tying
 * up a request handler.
 */

import { createHash } from 'node:crypto';
import { env } from '../lib/env.js';
import { serviceUnavailable } from '../lib/errors.js';

const UPLOAD_FOLDER = 'socialboost';

function requireConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw serviceUnavailable('Media uploads are not configured on this server.');
  }
  return { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET };
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Signs an upload scoped to this organization's folder.
 *
 * Cloudinary signs the sorted, joined parameter string; the client must send
 * back exactly these parameters or the upload is rejected.
 */
export function createUploadSignature(organizationId: string): UploadSignature {
  const config = requireConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${UPLOAD_FOLDER}/${organizationId}`;

  const paramsToSign: Record<string, string | number> = { folder, timestamp };
  const paramString = Object.entries(paramsToSign)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const signature = createHash('sha1')
    .update(paramString + config.CLOUDINARY_API_SECRET)
    .digest('hex');

  return {
    cloudName: config.CLOUDINARY_CLOUD_NAME,
    apiKey: config.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
  };
}

/**
 * Adds a delivery transformation that keeps videos within the limits every
 * platform accepts: 1080p, automatic codec, automatic quality.
 *
 * Returns the URL unchanged if it is not a Cloudinary video or already carries
 * a transformation, so calling this twice is safe.
 */
export function withVideoTransformation(url: string): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload')) return url;
  if (/\/upload\/[^/]*(c_|w_|h_|q_|vc_)[^/]*\//.test(url)) return url;
  return url.replace('/upload/', '/upload/w_1920,h_1080,c_limit,vc_auto,q_auto:good/');
}

/** Derives a still frame from a Cloudinary video, used as a thumbnail. */
export function videoThumbnailUrl(url: string): string | undefined {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload')) return undefined;
  return url.replace('/upload/', '/upload/so_0,w_640,c_limit/').replace(/\.[^./]+$/, '.jpg');
}
