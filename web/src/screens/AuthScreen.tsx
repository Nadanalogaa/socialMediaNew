import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, saveSession, type InvitationPreview, type Session } from '../lib/api';

interface Props {
  onAuthenticated: (session: Session) => void;
  /** Set when the person arrived through an invitation link. */
  inviteToken?: string | null;
  /** The platform admin sign-in: no sign-up, and only admin accounts get through. */
  adminMode?: boolean;
  /** Which form opens first; the toggle still switches between them. */
  initialMode?: 'login' | 'register';
  /** Takes the person back to the website. */
  onBack?: () => void;
}

/** Sign-in and sign-up share one screen; the toggle only changes two fields. */
export function AuthScreen({ onAuthenticated, inviteToken, adminMode = false, initialMode = 'login', onBack }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [invite, setInvite] = useState<InvitationPreview | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    api
      .previewInvitation(inviteToken)
      .then((preview) => {
        setInvite(preview);
        setEmail((current) => current || preview.email);
        // Joining a workspace does not need a business of one's own.
        setOrganizationName((current) => current || 'My workspace');
      })
      .catch(() => setInvite(null));
  }, [inviteToken]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const session = isRegister
        ? await api.register({ email, password, name, organizationName })
        : await api.login({ email, password });
      if (adminMode && !session.user.isPlatformAdmin) {
        // The credentials were right, but this door is for the platform team only.
        await api.logout(session.refreshToken).catch(() => undefined);
        setError('This account is not a platform admin. Sign in to the app at the main address instead.');
        return;
      }
      saveSession(session);
      onAuthenticated(session);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
      } else {
        setError('Could not reach the server. Is the API running on port 3001?');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white ${adminMode ? 'bg-amber-500' : 'bg-brand-600'}`}>
            SB
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {adminMode ? 'Platform admin' : isRegister ? 'Create your account' : 'Sign in to SocialBoost'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {adminMode ? 'For the team that runs SocialBoost. Customers sign in at the main address.' : isRegister ? 'Start promoting across every channel.' : 'Welcome back.'}
          </p>
        </div>

        {invite && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              invite.expired || invite.accepted
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {invite.expired
              ? 'This invitation has expired. Ask for a new link.'
              : invite.accepted
                ? 'This invitation was already used. Just sign in.'
                : `${invite.inviter} invited you to join ${invite.organizationName}. Sign in, or create an account, and you're in.`}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {isRegister && (
            <>
              <Field
                label="Your name"
                value={name}
                onChange={setName}
                error={fieldErrors.name}
                autoComplete="name"
              />
              <Field
                label="Business name"
                value={organizationName}
                onChange={setOrganizationName}
                error={fieldErrors.organizationName}
                autoComplete="organization"
              />
            </>
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            autoComplete="email"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            hint={isRegister ? 'At least 10 characters.' : undefined}
          />

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${adminMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700'}`}
          >
            {busy ? 'Please wait…' : isRegister ? 'Create account' : adminMode ? 'Sign in to admin' : 'Sign in'}
          </button>
        </form>

        {adminMode ? (
          <p className="mt-5 text-center text-sm text-slate-600">
            <a href="/" className="font-medium text-brand-600 hover:underline">
              Go to the website
            </a>
          </p>
        ) : (
        <p className="mt-5 text-center text-sm text-slate-600">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isRegister ? 'login' : 'register');
              setError(null);
              setFieldErrors({});
            }}
            className="font-medium text-brand-600 hover:underline"
          >
            {isRegister ? 'Sign in' : 'Sign up'}
          </button>
          {onBack && (
            <>
              {' · '}
              <button type="button" onClick={onBack} className="text-slate-500 hover:underline">
                Back to website
              </button>
            </>
          )}
        </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
  hint,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-brand-500/30 ${
          error ? 'border-red-400' : 'border-slate-300 focus:border-brand-500'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}
