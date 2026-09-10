/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Meta app id, used to initialise the Facebook JS SDK in the browser. */
  readonly VITE_META_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
