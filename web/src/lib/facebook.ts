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
        options: { scope: string; return_scopes?: boolean },
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
 * Permissions needed to list pages, publish, and read engagement.
 *
 * These require Advanced Access from Meta App Review before anyone outside
 * the app's dev/test users can grant them.
 */
export const REQUIRED_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'read_insights',
].join(',');

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

/** Opens the Facebook consent dialog and resolves with a short-lived token. */
export function facebookLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK is not ready yet.'));
      return;
    }
    window.FB.login(
      (response) => {
        if (response.status === 'connected' && response.authResponse) {
          resolve(response.authResponse.accessToken);
        } else {
          reject(new Error('Facebook sign-in was cancelled or not fully authorised.'));
        }
      },
      { scope: REQUIRED_SCOPES, return_scopes: true },
    );
  });
}
