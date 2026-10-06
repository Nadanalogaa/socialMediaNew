/**
 * Facebook JS SDK loader.
 *
 * Loaded on demand rather than on app start: most sessions never touch it, and
 * it is a third-party script that should not be in the critical path.
 */

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
      logout: (callback: () => void) => void;
      getLoginStatus: (callback: (response: FacebookLoginResponse) => void) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export interface FacebookLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: { accessToken: string; userID: string; grantedScopes?: string };
}

/**
 * Business apps use Facebook Login for Business, which grants permissions from
 * a named *configuration* rather than from a scope list. Passing `scope` to
 * such an app is rejected outright with "this app isn't available", so the
 * configuration id is used when one is set.
 */
const configId = import.meta.env.VITE_META_CONFIG_ID;
export const usesBusinessLogin = Boolean(configId);

/**
 * Permissions requested at login.
 *
 * Meta rejects the whole login if any requested scope is not configured on the
 * app, so Instagram is requested separately: its permissions come from an
 * Instagram use case that has to be added in the app dashboard, and asking for
 * them before that exists blocks Facebook sign-in entirely.
 *
 * All of these still need Advanced Access from App Review before anyone
 * outside the app's own admins, developers and testers can grant them.
 */
const PAGE_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'read_insights',
];

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
];

/** Set VITE_META_INSTAGRAM_ENABLED=true once the Instagram use case exists. */
const instagramEnabled = import.meta.env.VITE_META_INSTAGRAM_ENABLED === 'true';

export const REQUIRED_SCOPES = [
  ...PAGE_SCOPES,
  ...(instagramEnabled ? INSTAGRAM_SCOPES : []),
].join(',');

export const isInstagramEnabled = instagramEnabled;

let loadPromise: Promise<void> | null = null;

export function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version: 'v23.0' });
      resolve();
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Could not load the Facebook SDK. Check your connection or ad blocker.'));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

/**
 * Opens the Facebook consent dialog and resolves with a short-lived token.
 *
 * Failures are reported specifically rather than as one catch-all message:
 * a declined permission, a dismissed dialog and an unauthorised app all look
 * identical to the user otherwise, and they need different fixes.
 */
export function facebookLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK is not ready yet. Reload the page and try again.'));
      return;
    }

    // Business login takes a configuration; classic login takes scopes.
    const loginOptions = configId
      ? { config_id: configId, response_type: 'token', override_default_response_type: true }
      : { scope: REQUIRED_SCOPES, return_scopes: true };

    window.FB.login(
      (response) => {
        console.log('Facebook login response:', response);

        if (response.status !== 'connected' || !response.authResponse) {
          reject(new Error(describeLoginFailure(response)));
          return;
        }

        // Meta returns `connected` even when the user unticked permissions on
        // the consent screen, so the granted list has to be checked explicitly.
        // Business login reports granted scopes only sometimes, so an empty
        // list there is not treated as a refusal.
        const grantedScopes = response.authResponse.grantedScopes;
        const granted = new Set((grantedScopes ?? '').split(','));
        const declined =
          configId && !grantedScopes
            ? []
            : REQUIRED_SCOPES.split(',').filter((scope) => !granted.has(scope));

        if (declined.length > 0) {
          reject(
            new Error(
              `Facebook sign-in succeeded but these permissions were not granted: ${declined.join(
                ', ',
              )}. Press Connect again and leave every option switched on.`,
            ),
          );
          return;
        }

        resolve(response.authResponse.accessToken);
      },
      loginOptions,
    );
  });
}

function describeLoginFailure(response: FacebookLoginResponse): string {
  switch (response.status) {
    case 'not_authorized':
      return 'You are signed in to Facebook but did not authorise this app. Press Connect again and choose Continue.';
    case 'unknown':
      return 'The Facebook window closed before sign-in finished. Check that your browser is not blocking pop-ups, then try again.';
    default:
      return `Facebook sign-in did not complete (status: ${response.status}).`;
  }
}
