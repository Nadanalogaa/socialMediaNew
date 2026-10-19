import { useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { AdminShell } from './screens/AdminShell';
import { LandingScreen } from './screens/LandingScreen';
import { GuestStudioScreen } from './screens/GuestStudioScreen';
import {
  api,
  clearSession,
  loadSession,
  onSessionExpired,
  saveSession,
  setSessionScope,
  type Session,
} from './lib/api';

/** The token from an /invite/<token> link, kept until the person is signed in. */
function pendingInviteToken(): string | null {
  const match = /^\/invite\/([A-Za-z0-9_-]+)/.exec(window.location.pathname);
  if (match) {
    try {
      localStorage.setItem('invite.token', match[1]!);
    } catch {
      /* fine */
    }
    window.history.replaceState(null, '', '/');
    return match[1]!;
  }
  try {
    return localStorage.getItem('invite.token');
  } catch {
    return null;
  }
}

type View = 'app' | 'admin';
const viewFromUrl = (): View => (window.location.pathname.startsWith('/admin') ? 'admin' : 'app');

/** The public pages: the website, and the two sign-in forms. */
type Page = 'site' | 'login' | 'register' | 'app' | 'try';
function pageFromUrl(): Page {
  const path = window.location.pathname;
  if (path === '/login') return 'login';
  if (path === '/register') return 'register';
  if (path === '/try') return 'try';
  if (path === '/' || path === '') return 'site';
  return 'app';
}

/** Reads the session stored for a view without disturbing the active scope. */
function sessionFor(view: View): Session | null {
  setSessionScope(view);
  const found = loadSession();
  setSessionScope(viewFromUrl());
  return found;
}

/**
 * Two doors, two sessions.
 *
 * `/` is the app customers use; `/admin` is the platform module with its
 * own sign-in that only admin accounts pass. Each keeps its own session, so
 * being signed in to one says nothing about the other. "Open as owner"
 * crosses from admin into the app on a temporary session and comes back.
 */
export default function App() {
  const [view, setView] = useState<View>(viewFromUrl);
  const [page, setPage] = useState<Page>(pageFromUrl);
  const [session, setSession] = useState<Session | null>(() => sessionFor('app'));
  const [adminSession, setAdminSession] = useState<Session | null>(() => sessionFor('admin'));
  const [inviteToken, setInviteToken] = useState<string | null>(() => pendingInviteToken());
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  /** The app session an admin had before stepping in as a customer, if any. */
  const [parkedAppSession, setParkedAppSession] = useState<Session | null | undefined>(undefined);
  const impersonating = parkedAppSession !== undefined;

  // The scope follows the view, so every request carries the right token.
  useEffect(() => {
    setSessionScope(view);
  }, [view]);

  useEffect(() => {
    const onPop = () => {
      setView(viewFromUrl());
      setPage(pageFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(next: View) {
    window.history.pushState(null, '', next === 'admin' ? '/admin' : '/app');
    setSessionScope(next);
    setView(next);
    setPage('app');
  }

  function goPage(next: Page) {
    window.history.pushState(null, '', next === 'site' ? '/' : `/${next}`);
    setPage(next);
    setView('app');
  }

  function impersonate(target: Session) {
    setParkedAppSession(session);
    setSessionScope('app');
    saveSession(target);
    setSession(target);
    go('app');
  }

  function stopImpersonating() {
    if (!impersonating) return;
    setSessionScope('app');
    if (parkedAppSession) saveSession(parkedAppSession);
    else clearSession();
    setSession(parkedAppSession ?? null);
    setParkedAppSession(undefined);
    go('admin');
  }

  // Once signed in, an invitation is accepted and the workspace switched.
  useEffect(() => {
    if (!session || !inviteToken || view !== 'app') return;
    const token = inviteToken;
    setInviteToken(null);
    try {
      localStorage.removeItem('invite.token');
    } catch {
      /* fine */
    }
    api
      .acceptInvitation(token)
      .then((organization) => {
        const next = { ...session, organization, organizations: [...(session.organizations ?? []).filter((o) => o.id !== organization.id), organization] };
        saveSession(next);
        setSession(next);
      })
      .catch((err) => setInviteNotice(err instanceof Error ? err.message : 'Could not accept the invitation.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, inviteToken, view]);

  // Signed in already: the forms have nothing to do, so they lead into the app.
  useEffect(() => {
    if (session && (page === 'login' || page === 'register')) goPage('app');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, page]);

  // Return to the sign-in screen when a session ends, rather than leaving a
  // dashboard on screen whose every action would fail.
  useEffect(
    () =>
      onSessionExpired(() => {
        if (viewFromUrl() === 'admin') setAdminSession(null);
        else setSession(null);
      }),
    [],
  );

  async function signOut(which: View) {
    setSessionScope(which);
    const current = which === 'admin' ? adminSession : session;
    if (which === 'admin') setAdminSession(null);
    else {
      setSession(null);
      goPage('site');
    }
    clearSession();
    setSessionScope(which === 'admin' ? 'admin' : viewFromUrl());
    // Best-effort revocation; the local session is already gone either way.
    if (current?.refreshToken) await api.logout(current.refreshToken).catch(() => undefined);
  }

  if (view === 'admin') {
    if (!adminSession) {
      return (
        <AuthScreen
          adminMode
          onAuthenticated={(s) => {
            setAdminSession(s);
          }}
        />
      );
    }
    return (
      <AdminShell
        session={adminSession}
        onOpenApp={() => go('app')}
        onSignOut={() => void signOut('admin')}
        onImpersonate={impersonate}
      />
    );
  }

  // The website, and the sign-in / sign-up pages. An invitation link skips
  // the website and goes straight to the form.
  if (page === 'site' && !inviteToken) {
    return (
      <LandingScreen
        signedIn={session !== null}
        onSignIn={() => goPage('login')}
        onRegister={() => goPage('register')}
        onOpenApp={() => goPage('app')}
        onTry={() => goPage('try')}
      />
    );
  }
  if (page === 'try') {
    return <GuestStudioScreen onSignIn={() => goPage('login')} onRegister={() => goPage('register')} onHome={() => goPage('site')} />;
  }
  if (!session) {
    return (
      <AuthScreen
        key={page}
        initialMode={page === 'register' ? 'register' : 'login'}
        onAuthenticated={(s) => {
          setSession(s);
          goPage('app');
        }}
        inviteToken={inviteToken}
        onBack={() => goPage('site')}
      />
    );
  }
  return (
    <DashboardScreen
      session={session}
      onSignOut={() => void signOut('app')}
      onSessionChange={setSession}
      notice={inviteNotice}
      onDismissNotice={() => setInviteNotice(null)}
      onOpenAdmin={session.user.isPlatformAdmin || adminSession ? () => go('admin') : undefined}
      impersonating={impersonating}
      onStopImpersonating={stopImpersonating}
    />
  );
}
