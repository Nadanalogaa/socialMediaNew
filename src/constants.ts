
/** Maximum image size in megabytes before compression is attempted. */
export const MAX_IMAGE_SIZE_MB = 10;

/** Configuration for client-side image compression before upload. */
export const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 2,
    maxWidth: 1920,
    quality: 0.85,
};

/** Chunk size in bytes for large video uploads to Cloudinary. */
export const CLOUDINARY_VIDEO_CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB

/** The target folder for all uploads in Cloudinary. */
export const CLOUDINARY_UPLOAD_FOLDER = 'nadanaloga/uploads';
