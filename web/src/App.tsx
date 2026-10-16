import { useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { DashboardScreen } from './screens/DashboardScreen';
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
  return (
    <DashboardScreen
      session={session}
      onSignOut={handleSignOut}
      onSessionChange={setSession}
      notice={inviteNotice}
      onDismissNotice={() => setInviteNotice(null)}
    />
  );
}
