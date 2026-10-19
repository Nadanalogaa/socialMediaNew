import { useState } from 'react';
import type { Session } from '../lib/api';
import { AdminScreen, type AdminTab } from './AdminScreen';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'customers', label: 'Customers' },
  { key: 'users', label: 'Users' },
  { key: 'payments', label: 'Payments' },
];

/**
 * The platform admin module: its own shell, at /admin, for the people who
 * run the service. Customers never see it; "Open as owner" leads from here
 * into the ordinary app as that customer.
 */
export function AdminShell({
  session,
  onOpenApp,
  onSignOut,
  onImpersonate,
}: {
  session: Session;
  onOpenApp: () => void;
  onSignOut: () => void;
  onImpersonate: (session: Session) => void;
}) {
  const [tab, setTab] = useState<AdminTab>('overview');

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-white">SB</div>
          <span className="text-sm font-semibold text-amber-900">Admin</span>
          <nav className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex gap-0.5">
              {TABS.map((t) => (
                <li key={t.key}>
                  <button
                    onClick={() => setTab(t.key)}
                    aria-current={tab === t.key ? 'page' : undefined}
                    className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${
                      tab === t.key ? 'bg-amber-200 font-medium text-amber-900' : 'text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <span className="hidden text-xs text-amber-800 sm:block">{session.user.email}</span>
          <button onClick={onOpenApp} className="shrink-0 rounded-lg border border-amber-300 px-2.5 py-1.5 text-sm text-amber-900 hover:bg-amber-100">
            Open app
          </button>
          <button onClick={onSignOut} className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-amber-800 hover:bg-amber-100">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">
        <AdminScreen tab={tab} session={session} onImpersonate={onImpersonate} />
      </main>
    </div>
  );
}
