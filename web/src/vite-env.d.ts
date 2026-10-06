/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Meta app id, used to initialise the Facebook JS SDK in the browser. */
  readonly VITE_META_APP_ID?: string;
  /**
   * Whether to request Instagram permissions at login. Keep this off until an
   * Instagram use case is added to the Meta app — requesting scopes the app
   * does not have makes Meta refuse the whole login.
   */
  readonly VITE_META_INSTAGRAM_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
