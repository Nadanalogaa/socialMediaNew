import { GUEST_LIMITS, GuestProvider } from '../lib/guest';
import { ReelsScreen } from './ReelsScreen';

/**
 * The editor, open to anyone, at /try. Nothing leaves the browser: photos and
 * sound are used from the device, and the export downloads directly.
 */
export function GuestStudioScreen({
  onSignIn,
  onRegister,
  onHome,
}: {
  onSignIn: () => void;
  onRegister: () => void;
  onHome: () => void;
}) {
  // "/try?describe=…&lang=…" from the website's box: Magic Design opens writing.
  const params = new URLSearchParams(window.location.search);
  const describe = params.get('describe')?.trim() || undefined;
  const lang = params.get('lang')?.trim() || undefined;
  return (
    <GuestProvider onSignIn={onSignIn} onRegister={onRegister}>
      <div className="flex min-h-full flex-col bg-slate-50">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-[1700px] items-center gap-3 px-4 py-2">
            <button onClick={onHome} className="flex items-center gap-2" aria-label="SocialBoost home">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">SB</span>
              <span className="text-sm font-semibold text-slate-900">SocialBoost</span>
            </button>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Try the editor · free, no account</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onSignIn} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Sign in
              </button>
              <button onClick={onRegister} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                Start free
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1700px] flex-1 px-4 py-3">
          <p className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Your photos and sound stay on this device and the reel downloads here. In this free preview:{' '}
            {GUEST_LIMITS.scenes} scenes, {GUEST_LIMITS.effects.length} effects, {GUEST_LIMITS.fonts.length} fonts, 720p export with a small
            watermark. Anything with a 🔒 opens up with a free account.
          </p>
          <ReelsScreen initialDescription={describe} initialLanguage={lang} />
        </main>
      </div>
    </GuestProvider>
  );
}
