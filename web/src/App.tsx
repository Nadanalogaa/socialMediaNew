import { useEffect, useState } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { api, clearSession, loadSession, onSessionExpired, type Session } from './lib/api';

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

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

  if (!session) return <AuthScreen onAuthenticated={setSession} />;
  return <DashboardScreen session={session} onSignOut={handleSignOut} />;
}
