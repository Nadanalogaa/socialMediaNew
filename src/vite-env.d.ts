/// <reference types="vite/client" />

// This file provides type definitions for Vite's special `import.meta.env` object.

interface ImportMetaEnv {
  readonly VITE_FACEBOOK_APP_ID: string;
  // Add other env variables here as needed.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
