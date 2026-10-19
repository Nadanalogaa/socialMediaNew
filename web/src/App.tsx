import { useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { AdminShell } from './screens/AdminShell';
import { api, clearSession, loadSession, onSessionExpired, saveSession, type Session } from './lib/api';

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

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [inviteToken, setInviteToken] = useState<string | null>(() => pendingInviteToken());
  /** The admin's own session, kept while they look at a customer's workspace. */
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  /** /admin is the platform module; everything else is the app. */
  const [view, setView] = useState<'app' | 'admin'>(() => (window.location.pathname === '/admin' ? 'admin' : 'app'));

  useEffect(() => {
    const onPop = () => setView(window.location.pathname === '/admin' ? 'admin' : 'app');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(next: 'app' | 'admin') {
    window.history.pushState(null, '', next === 'admin' ? '/admin' : '/');
    setView(next);
  }

  function impersonate(target: Session) {
    if (!session) return;
    setAdminSession(session);
    saveSession(target);
    setSession(target);
    go('app');
  }

  function stopImpersonating() {
    if (!adminSession) return;
    saveSession(adminSession);
    setSession(adminSession);
    setAdminSession(null);
    go('admin');
  }
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  // Once signed in, an invitation is accepted and the workspace switched.
  useEffect(() => {
    if (!session || !inviteToken) return;
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
  }, [session?.user.id, inviteToken]);

  // Return to the sign-in screen when a session ends, rather than leaving a
  // dashboard on screen whose every action would fail.
  useEffect(() => onSessionExpired(() => setSession(null)), []);

  async function handleSignOut() {
    const current = session;
    setSession(null);
    clearSession();
    // Best-effort revocation; the local session is already gone either way.
    if (current) await api.logout(current.refreshToken).catch(() => undefined);
  }

  if (!session) return <AuthScreen onAuthenticated={setSession} inviteToken={inviteToken} />;
  if (view === 'admin' && session.user.isPlatformAdmin && !adminSession) {
    return <AdminShell session={session} onOpenApp={() => go('app')} onSignOut={handleSignOut} onImpersonate={impersonate} />;
  }
  return (
    <DashboardScreen
      session={session}
      onSignOut={handleSignOut}
      onSessionChange={setSession}
      notice={inviteNotice}
      onDismissNotice={() => setInviteNotice(null)}
      onOpenAdmin={session.user.isPlatformAdmin ? () => go('admin') : undefined}
      impersonating={adminSession !== null}
      onStopImpersonating={stopImpersonating}
    />
  );
}
