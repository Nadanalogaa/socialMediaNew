import { useState } from 'react';
import { MAGIC_TEMPLATES, PLANS, PLAN_ORDER } from '@socialboost/shared';
import { rupees } from '../lib/money';

/**
 * The public website: what SocialBoost does, for whom, at what price —
 * and the two doors in: Start free and Sign in.
 */
export function LandingScreen({
  signedIn,
  onSignIn,
  onRegister,
  onOpenApp,
  onTry,
}: {
  signedIn: boolean;
  onSignIn: () => void;
  onRegister: () => void;
  onOpenApp: () => void;
  /** Opens the free studio; with a description, Magic Design writes the reel at once. */
  onTry: (describe?: string, language?: string) => void;
}) {
  const primary = 'rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700';
  const secondary = 'rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100';

  return (
    <div className="min-h-full bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">SB</div>
          <span className="text-base font-semibold">SocialBoost</span>
          <nav className="ml-6 hidden gap-5 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <button onClick={onOpenApp} className={primary}>Open app</button>
            ) : (
              <>
                <button onClick={onSignIn} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign in</button>
                <button onClick={onRegister} className={primary}>Start free</button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">Made for Indian businesses · ₹ pricing · UPI</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Describe your business.<br />Get a reel in a minute.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Tell Magic Design what you do and what you want to announce. It writes the story, lays out the scenes, picks the photos and animates the text. No account needed to try.
          </p>
        </div>
        <MagicBox onTry={onTry} />
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500">
          <span>Already have an account?</span>
          <button onClick={signedIn ? onOpenApp : onSignIn} className="font-medium text-brand-600 hover:underline">
            {signedIn ? 'Open the app' : 'Sign in'}
          </button>
          <span>·</span>
          <button onClick={() => onTry()} className="font-medium text-brand-600 hover:underline">
            Open the editor without describing
          </button>
        </div>
      </section>

      <section className="border-t border-slate-100 py-14">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">From a few sentences to a finished reel</h2>
            <p className="mt-3 text-slate-600">
              Magic Design turns your words into a story: an opening that hooks, what you offer, why to trust you, the offer, and how to reach you. Photos that fit each scene are placed for you, your logo sits on every scene, and every line stays editable.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
              <li>✓ English, Tamil, Hindi and more</li>
              <li>✓ Templates for {new Set(MAGIC_TEMPLATES.map((t) => t.industry)).size} industries to start from</li>
              <li>✓ Change anything by hand, or ask for a rewrite</li>
              <li>✓ Free preview: 3 scenes, 720p with a small watermark</li>
              <li>✓ Sign up free for full HD, photos, your logo, saving and publishing</li>
            </ul>
            <button onClick={() => onTry()} className={`${primary} mt-6 !px-6 !py-3 !text-base`}>Open the editor</button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <Mockup />
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold">Everything a small business needs to be seen</h2>
          <p className="mt-2 max-w-2xl text-slate-600">One simple app instead of five tools and a designer.</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-lg">{f.icon}</div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how" className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border border-slate-200 p-5">
                <span className="absolute -top-3 left-5 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">{i + 1}</span>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold">Simple prices, in rupees</h2>
          <p className="mt-2 text-slate-600">Per business, per month. Pay yearly and get two months free. Every new account starts with 14 days of Growth.</p>
          <ul className="mt-8 grid gap-4 md:grid-cols-4">
            {PLAN_ORDER.map((code) => {
              const plan = PLANS[code]!;
              const featured = code === 'growth';
              return (
                <li key={code} className={`flex flex-col rounded-2xl border bg-white p-5 ${featured ? 'border-brand-500 shadow-lg ring-1 ring-brand-500' : 'border-slate-200'}`}>
                  {featured && <span className="mb-2 self-start rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white">Most popular</span>}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-xs text-slate-500">{plan.tagline}</p>
                  <p className="mt-3 text-3xl font-semibold">
                    {plan.priceInPaise === 0 ? '₹0' : rupees(plan.priceInPaise)}
                    {plan.priceInPaise > 0 && <span className="text-sm font-normal text-slate-500"> / month</span>}
                  </p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-700">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex gap-2"><span className="text-emerald-600">✓</span>{h}</li>
                    ))}
                  </ul>
                  <button onClick={signedIn ? onOpenApp : onRegister} className={`mt-5 ${featured ? primary : secondary} w-full`}>
                    {plan.priceInPaise === 0 ? 'Start free' : 'Start 14-day trial'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="faq" className="py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl font-semibold">Questions</h2>
          <dl className="mt-6 divide-y divide-slate-200">
            {FAQ.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-sm text-slate-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-brand-600 py-14 text-white">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-2xl font-semibold">Your next post could be done in five minutes.</h2>
          <button onClick={signedIn ? onOpenApp : onRegister} className="mt-6 rounded-lg bg-white px-6 py-3 text-base font-medium text-brand-700 hover:bg-brand-50">
            {signedIn ? 'Open app' : 'Start free'}
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-sm text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
          <span>© {new Date().getFullYear()} SocialBoost · Nadanaloga Fine Arts Academy, Chennai</span>
          <nav className="flex gap-4">
            <a href="/privacy-policy.html" className="hover:text-slate-900">Privacy</a>
            <a href="/terms-of-service.html" className="hover:text-slate-900">Terms</a>
            <a href="/data-deletion.html" className="hover:text-slate-900">Data deletion</a>
            <a href="mailto:admin@nadanaloga.com" className="hover:text-slate-900">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: '📅', title: 'Publish & schedule', body: 'One caption to every channel, a calendar you can drag posts around, a queue with your posting times, and the best time to post from your own results.' },
  { icon: '✨', title: 'Magic Design', body: 'Type what each scene should say, pick photos, and get a finished reel with your logo, colours and a QR code — no designer, no AI bill.' },
  { icon: '🎬', title: 'Reels & posters', body: 'An editor made for phones: scenes, animations, effects, music with trim, and templates for offers, festivals and announcements.' },
  { icon: '◆', title: 'Brand kit', body: 'Set your logo, colours, font and contact details once. Every reel, poster and caption uses them.' },
  { icon: '👥', title: 'Team & approvals', body: 'Invite staff by WhatsApp link. Members draft, you approve. Clients can see and approve their own posts.' },
  { icon: '◳', title: 'Analytics & reports', body: 'See what worked, which channel brings engagement, and send clients a branded PDF report.' },
];

const STEPS = [
  { title: 'Connect your pages', body: 'Sign in with Facebook once. Your Page and Instagram account are connected in a minute.' },
  { title: 'Create', body: 'Write a post, or describe a reel in a few lines and let Magic Design build it. Add it to the queue.' },
  { title: 'Grow', body: 'Posts go out at the best times. Home shows you what to do next and what is working.' },
];

const FAQ = [
  { q: 'Which networks are supported?', a: 'Facebook Pages and Instagram business accounts today. YouTube Shorts and Google Business Profile are next.' },
  { q: 'Do I need a designer or an AI subscription?', a: 'No. Reels and posters are made inside the app from your own text and photos; nothing is sent to a paid AI service.' },
  { q: 'Can my team or my clients use it?', a: 'Yes. Invite people with a link at a role: admin, member, or client. Turn on approvals so nothing goes out unchecked.' },
  { q: 'How do I pay?', a: 'By UPI, card or net banking through Razorpay, monthly or yearly. There is a free plan with no time limit.' },
  { q: 'Is it an app?', a: 'It works in any browser and installs on Android and iPhone from the browser menu ("Add to Home Screen").' },
];

const BOX_LANGUAGES = ['English', 'Tamil', 'Hindi', 'Telugu', 'Kannada', 'Malayalam'];

/** Quick starts shown under the box: one per industry, first template each. */
const QUICK_STARTS = Array.from(
  MAGIC_TEMPLATES.reduce((map, template) => (map.has(template.industry) ? map : map.set(template.industry, template)), new Map<string, (typeof MAGIC_TEMPLATES)[number]>()).values(),
).slice(0, 6);

/**
 * The conversation window on the website: a visitor describes the business
 * and lands in the studio with the story already written.
 */
function MagicBox({ onTry }: { onTry: (describe?: string, language?: string) => void }) {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('English');
  const ready = text.trim().length >= 10;

  function submit() {
    if (!ready) return;
    onTry(text.trim(), language);
  }

  return (
    <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-brand-600/10 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-500 text-base text-white">✨</span>
        <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-800">
          Hi! Tell me about your business and what you want to announce. I will write the reel: scenes, photos and all.
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-slate-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={4}
          placeholder="I run a dance academy in Chennai called Sree Annai. We teach Bharatanatyam and Carnatic music for kids and adults. Admissions open for the July batch, free demo class…"
          className="w-full resize-none rounded-t-2xl bg-transparent px-4 py-3 text-sm leading-relaxed outline-none sm:text-base"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" aria-label="Language of the reel">
            {BOX_LANGUAGES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span className="hidden text-xs text-slate-400 sm:inline">Ctrl + Enter to send</span>
          <button
            onClick={submit}
            disabled={!ready}
            className="ml-auto rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✨ Create my reel — free, no account
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">Try one:</span>
        {QUICK_STARTS.map((template) => (
          <button
            key={template.slug}
            onClick={() => setText(template.description.replace(/\{name\}/g, 'We').replace(/\{city\}/g, 'Chennai').replace(/^We is /, 'We are '))}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50"
          >
            {template.emoji} {template.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A stylised screenshot, so the hero has something to look at without an image file. */
function Mockup() {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2 rounded-lg bg-white p-2 shadow-sm">
        <span className="h-6 w-6 rounded bg-brand-600" />
        <span className="font-medium">Good morning, Priya</span>
        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">6 days scheduled</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['Posts this week 5 · +25%', 'Engagement 1.2k · +40%', 'Best time Tue 19:00'].map((t) => (
          <div key={t} className="rounded-lg bg-white p-2 shadow-sm text-slate-700">{t}</div>
        ))}
      </div>
      <div className="rounded-lg bg-white p-2 shadow-sm">
        <div className="mb-1 flex justify-between text-slate-500"><span>October</span><span>Calendar</span></div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 21 }, (_, i) => (
            <div key={i} className={`h-7 rounded ${[2, 5, 9, 12, 16, 19].includes(i) ? 'bg-brand-100' : 'bg-slate-100'}`} />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg bg-gradient-to-br from-indigo-600 to-fuchsia-500 p-3 text-white shadow-sm">
          <p className="font-semibold">Admissions open ✨</p>
          <p className="opacity-80">Magic Design · 3 scenes</p>
        </div>
        <div className="flex-1 rounded-lg bg-white p-3 shadow-sm text-slate-700">
          <p className="font-medium">Needs approval</p>
          <p className="text-slate-500">Diwali offer — by Arjun</p>
          <span className="mt-1 inline-block rounded bg-brand-600 px-2 py-0.5 text-white">Approve</span>
        </div>
      </div>
    </div>
  );
}
