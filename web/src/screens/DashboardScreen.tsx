import type { Session } from '../lib/api';

/**
 * Application shell.
 *
 * Each pillar has a place in the navigation from day one so the structure is
 * visible while the modules land behind them. Sections that are not built yet
 * say so plainly rather than showing fake data.
 */

interface Props {
  session: Session;
  onSignOut: () => void;
}

interface NavItem {
  key: string;
  label: string;
  icon: string;
  status: 'ready' | 'building';
  blurb: string;
}

const NAV: NavItem[] = [
  { key: 'home', label: 'Home', icon: '◆', status: 'ready', blurb: 'Account overview.' },
  {
    key: 'publish',
    label: 'Publish',
    icon: '↗',
    status: 'building',
    blurb: 'Schedule posts to Facebook, Instagram and YouTube from one composer.',
  },
  {
    key: 'creatives',
    label: 'Creatives',
    icon: '▣',
    status: 'building',
    blurb: 'Fill a template, get a finished image or video ad in every size.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    icon: '✆',
    status: 'building',
    blurb: 'Opt-in contact lists, approved templates and throttled campaigns.',
  },
  {
    key: 'ads',
    label: 'Ads',
    icon: '◎',
    status: 'building',
    blurb: 'Meta and Google campaigns. Unlocks after ads API approval.',
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: '⚙',
    status: 'building',
    blurb: 'Brand profile, connected channels, billing and team.',
  },
];

export function DashboardScreen({ session, onSignOut }: Props) {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            SB
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{session.organization.name}</p>
            <p className="text-xs text-slate-500">
              {session.user.name} · {session.organization.role}
            </p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-900">Foundation is running</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            Auth, the tenant boundary and the database are live. The modules below are being
            built on top of them.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {NAV.map((item) => (
            <li
              key={item.key}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-slate-400">
                    {item.icon}
                  </span>
                  <span className="font-medium text-slate-900">{item.label}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.status === 'ready'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.status === 'ready' ? 'Ready' : 'Building'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.blurb}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
