// This file provides type definitions for Vite's special `import.meta.env` object.
// The original reference to `vite/client` was removed to fix a resolution error.

interface ImportMetaEnv {
  readonly VITE_FACEBOOK_APP_ID: string;
  // Add other env variables here as needed.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
