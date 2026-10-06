/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Meta app id, used to initialise the Facebook JS SDK in the browser. */
  readonly VITE_META_APP_ID?: string;
  /**
   * Facebook Login for Business configuration id. Business apps grant
   * permissions from a configuration rather than a scope list; set this and
   * the login call uses it instead of requesting scopes.
   */
  readonly VITE_META_CONFIG_ID?: string;
  /**
   * Whether to request Instagram permissions at login. Only applies to classic
   * scope-based login; with a configuration, Meta decides what it includes.
   */
  readonly VITE_META_INSTAGRAM_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
