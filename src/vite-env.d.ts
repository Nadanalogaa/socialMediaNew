// This file provides type definitions for Vite's special `import.meta.env` object.

interface ImportMetaEnv {
  readonly VITE_FACEBOOK_APP_ID: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
  // Add other env variables here as needed.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}