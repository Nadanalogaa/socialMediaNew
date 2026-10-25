import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The try-before-you-sign-up studio.
 *
 * A visitor gets the real editor with a deliberately smaller box of tools.
 * Everything they make stays on their device; everything locked is still
 * visible, so the upgrade is a tap away and the reason for it is obvious.
 */
export const GUEST_LIMITS = {
  /**
   * Off for now: visitors get the whole studio, full HD and no watermark, so
   * the first reel is the real thing. Flip to true to bring the caps back.
   */
  enforce: false,
  scenes: 3,
  /** Template slugs a guest can start from. */
  templates: ['reel-offer'],
  /** Particle effects a guest can use. */
  effects: ['sparkles', 'confetti', 'snow', 'hearts'],
  /** Font labels a guest can use. */
  fonts: ['Modern sans', 'Classic serif'],
  /** Export is scaled by this (1080×1920 → 720×1280). */
  exportScale: 2 / 3,
  watermark: 'Made with SocialBoost',
} as const;

interface GuestState {
  guest: boolean;
  /** Opens the sign-up prompt naming what is locked. Returns false (for convenience in handlers). */
  lock: (feature: string) => false;
}

const GuestContext = createContext<GuestState>({ guest: false, lock: () => false });

export const useGuest = () => useContext(GuestContext);

export function GuestProvider({
  children,
  onSignIn,
  onRegister,
}: {
  children: ReactNode;
  onSignIn: () => void;
  onRegister: () => void;
}) {
  const [locked, setLocked] = useState<string | null>(null);
  const lock = useCallback((feature: string): false => {
    setLocked(feature);
    return false;
  }, []);
  const value = useMemo(() => ({ guest: true, lock }), [lock]);

  return (
    <GuestContext.Provider value={value}>
      {children}
      {locked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setLocked(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">Free account</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{locked} needs an account</h2>
            <p className="mt-2 text-sm text-slate-600">
              Sign up free in a minute and the whole studio opens up — no card, and 14 days of the Growth plan.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              <li>✓ All templates, effects and fonts</li>
              <li>✓ Unlimited scenes · full HD export, no watermark</li>
              <li>✓ Save your designs and come back to them</li>
              <li>✓ Publish and schedule to Facebook &amp; Instagram</li>
              <li>✓ Logo and QR code in Magic Design</li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={onRegister} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Create free account
              </button>
              <button onClick={onSignIn} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Sign in
              </button>
              <button onClick={() => setLocked(null)} className="ml-auto px-2 py-2 text-sm text-slate-500 hover:underline">
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </GuestContext.Provider>
  );
}
