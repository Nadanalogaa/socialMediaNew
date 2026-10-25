import { useState } from 'react';
import { MAGIC_TEMPLATES, PLANS, PLAN_ORDER } from '@socialboost/shared';
import { rupees } from '../lib/money';

/**
 * The public website. The top band is Magic Design's conversation box: a
 * visitor describes the business and lands in the studio with the reel
 * written. Everything under it says what happens next — publishing,
 * Google, analytics, team — in as little space as it takes.
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
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">SB</div>
          <span className="text-base font-semibold">SocialBoost</span>
          <nav className="ml-6 hidden gap-5 text-sm text-slate-600 md:flex">
            <a href="#publish" className="hover:text-slate-900">Publish</a>
            <a href="#google" className="hover:text-slate-900">Google</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
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

      {/* ---- Top band: full width, the box and what follows it ------------ */}
      <section className="bg-gradient-to-br from-slate-900 via-indigo-950 to-fuchsia-950 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_1.1fr] lg:py-14">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">Made for Indian businesses · ₹ pricing · UPI · no card to start</p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
              Describe your business. Get a reel. Post it everywhere.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/80">
              Magic Design writes the story, lays out the scenes and picks the photos. Then one tap publishes it to Facebook, Instagram, YouTube and your Google Business Profile at the best time, and you see what it earned.
            </p>
            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              {PIPELINE.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <span className="text-xs font-semibold text-fuchsia-300">{i + 1} · {step.title}</span>
                  <p className="mt-1 text-sm text-white/80">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
              <span className="text-white/50">Publishes to</span>
              {CHANNELS.map((c) => (
                <span key={c.name} className="inline-flex items-center gap-1.5"><span className="text-base">{c.icon}</span>{c.name}</span>
              ))}
            </div>
          </div>
          {/* On a phone the box comes first; the steps follow it. */}
          <div className="order-first lg:order-none">
            <MagicBox onTry={onTry} />
            <p className="mt-3 text-center text-xs text-white/60">
              Free preview: 3 scenes, 720p with a small watermark.{' '}
              <button onClick={signedIn ? onOpenApp : onRegister} className="font-medium text-white underline-offset-2 hover:underline">
                {signedIn ? 'Open the app' : 'Start free for full HD, photos, your logo and publishing'}
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ---- Publish ------------------------------------------------------- */}
      <section id="publish" className="border-b border-slate-100">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Publish &amp; schedule</p>
            <h2 className="mt-1 text-2xl font-semibold md:text-3xl">Made is not posted. We post it.</h2>
            <p className="mt-3 text-slate-600">
              Connect your Facebook Page, Instagram, YouTube channel and Google Business Profile once. Write one caption, pick the channels, and the reel goes out now, at your posting slots, or at the time your own results say works best. Repeat posts, first comments, a drag-and-drop calendar and approvals for teams are built in.
            </p>
            <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {PUBLISH_POINTS.map((p) => (
                <li key={p} className="flex gap-2"><span className="text-emerald-600">✓</span>{p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <Mockup />
          </div>
        </div>
      </section>

      {/* ---- Google -------------------------------------------------------- */}
      <section id="google" className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Google, in the same app</p>
            <h2 className="mt-1 text-2xl font-semibold md:text-3xl">Get found on Google and know what it brings in</h2>
            <p className="mt-3 text-slate-600">
              Most customers in India search Google and Maps before they call. SocialBoost connects your Google account once and shows you, in plain words, what to fix and what is working.
            </p>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GOOGLE.map((g) => (
              <li key={g.title} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-lg">{g.icon}</div>
                <h3 className="font-semibold">{g.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{g.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Everything else ---------------------------------------------- */}
      <section id="features">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-2xl font-semibold md:text-3xl">Everything a small business needs to be seen</h2>
          <p className="mt-2 max-w-2xl text-slate-600">One app instead of a designer, a scheduler, an analytics tool and an agency.</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border border-slate-200 p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-lg">{f.icon}</div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Pricing ------------------------------------------------------- */}
      <section id="pricing" className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-2xl font-semibold md:text-3xl">Simple prices, in rupees</h2>
          <p className="mt-2 text-slate-600">Per business, per month. Pay yearly and get two months free. Every new account starts with 14 days of Growth.</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-4">
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

      {/* ---- FAQ ----------------------------------------------------------- */}
      <section id="faq">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-2xl font-semibold md:text-3xl">Questions</h2>
          <dl className="mt-4 grid gap-x-10 md:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="border-b border-slate-200 py-4">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-sm text-slate-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-brand-600 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-10">
          <div>
            <h2 className="text-2xl font-semibold">Your next reel could be posted in five minutes.</h2>
            <p className="mt-1 text-white/80">Describe, approve, publish. Then watch it work.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => onTry()} className="rounded-lg border border-white/40 px-6 py-3 text-base font-medium text-white hover:bg-white/10">Try it free</button>
            <button onClick={signedIn ? onOpenApp : onRegister} className="rounded-lg bg-white px-6 py-3 text-base font-medium text-brand-700 hover:bg-brand-50">
              {signedIn ? 'Open app' : 'Start free'}
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4">
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

const PIPELINE = [
  { title: 'Create', body: 'Describe your business; Magic Design writes the scenes and places the photos. Edit anything.' },
  { title: 'Publish', body: 'One tap to Facebook, Instagram, YouTube and Google Business Profile, now or at the best time.' },
  { title: 'Grow', body: 'See reach, engagement, Google rankings and reviews. Home tells you what to do next.' },
];

const CHANNELS = [
  { icon: '📘', name: 'Facebook' },
  { icon: '📸', name: 'Instagram' },
  { icon: '▶️', name: 'YouTube Shorts' },
  { icon: '📍', name: 'Google Business Profile' },
];

const PUBLISH_POINTS = [
  'Facebook Pages and Instagram reels, photos and carousels',
  'YouTube Shorts and Google Business Profile posts',
  'Best time to post, from your own results',
  'Calendar, queue slots and repeat posts',
  'First comment for hashtags',
  'Approvals: members draft, you approve',
];

const GOOGLE = [
  { icon: '📍', title: 'Business Profile', body: 'Post offers and updates to Maps, reply to reviews with a suggested answer, and see a score of what your listing is missing.' },
  { icon: '🔎', title: 'Search rankings', body: 'Which searches bring people to your website, where you rank, and keyword ideas to write about next.' },
  { icon: '📈', title: 'Analytics', body: 'Visitors, where they came from and what they did, with the tracking tag checked for you.' },
  { icon: '📣', title: 'Google Ads', body: 'Spend, clicks and cost per lead for your campaigns, next to the organic numbers, so you know what pays.' },
];

const FEATURES = [
  { icon: '✨', title: 'Magic Design', body: 'Describe the business, or pick an industry template, and get a reel with story, photos, logo, QR code and animated text. In English, Tamil, Hindi and more.' },
  { icon: '🎬', title: 'Reels & posters', body: 'A phone-friendly editor: scenes, animations, effects, music with trim, and templates for offers, festivals and announcements.' },
  { icon: '📅', title: 'Publish & schedule', body: 'One caption to every channel, a calendar, posting slots and the best time to post from your own results.' },
  { icon: '💬', title: 'Inbox & replies', body: 'Comments from every channel and Google reviews in one list, with a suggested reply in your brand voice.' },
  { icon: '👥', title: 'Team & clients', body: 'Invite staff or clients by link at a role. Approvals keep anything unchecked from going out. Agencies manage many businesses.' },
  { icon: '📄', title: 'Reports', body: 'See what worked, which channel brings engagement, and send clients a branded PDF report.' },
  { icon: '◆', title: 'Brand kit', body: 'Logo, colours, font and contact details set once and used in every reel, poster and caption.' },
  { icon: '🔔', title: 'Nudges', body: 'Home shows what to do today: a channel to reconnect, a review to answer, a quiet week, an empty queue.' },
  { icon: '📱', title: 'Works on your phone', body: 'Any browser, installs to the home screen, and the editor records video right on the device.' },
];

const FAQ = [
  { q: 'Which networks are supported?', a: 'Facebook Pages, Instagram business accounts, YouTube channels and Google Business Profile. Search Console, Analytics and Google Ads connect for reporting.' },
  { q: 'Do I need a designer or an AI subscription?', a: 'No. Magic Design is included in every plan, and there is no separate AI bill.' },
  { q: 'Can I try it without signing up?', a: 'Yes. Describe your business in the box above and you get a three-scene reel in your browser, no account. Sign up free to save, add photos automatically and publish.' },
  { q: 'Can my team or my clients use it?', a: 'Yes. Invite people with a link at a role: admin, member or client. Turn on approvals so nothing goes out unchecked.' },
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
    <div className="rounded-2xl bg-white p-3 text-slate-900 shadow-2xl shadow-black/30 sm:p-4">
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
            ✨ Create my reel<span className="hidden sm:inline"> — free, no account</span>
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


/** A stylised screenshot of publishing, so the section has something to look at without an image file. */
function Mockup() {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2 rounded-lg bg-white p-2 shadow-sm">
        <span className="h-6 w-6 rounded bg-gradient-to-br from-indigo-600 to-fuchsia-500" />
        <span className="font-medium">Admissions open ✨ · reel</span>
        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Scheduled · Tue 19:00</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {CHANNELS.map((c) => (
          <div key={c.name} className="rounded-lg bg-white p-2 text-center shadow-sm">
            <div className="text-base">{c.icon}</div>
            <div className="mt-0.5 truncate text-[10px] text-slate-600">{c.name}</div>
            <div className="mt-1 rounded bg-emerald-50 py-0.5 text-[10px] text-emerald-700">published</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white p-2 shadow-sm">
        <div className="mb-1 flex justify-between text-slate-500"><span>This month</span><span>Calendar</span></div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 21 }, (_, i) => (
            <div key={i} className={`h-6 rounded ${[2, 5, 9, 12, 16, 19].includes(i) ? 'bg-brand-100' : 'bg-slate-100'}`} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['Reach 8.4k · +32%', 'Engagement 1.2k · +40%', 'Google calls 27 · +9'].map((t) => (
          <div key={t} className="rounded-lg bg-white p-2 text-slate-700 shadow-sm">{t}</div>
        ))}
      </div>
    </div>
  );
}
