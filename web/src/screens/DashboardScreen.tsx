import { useState } from 'react';
import type { Session } from '../lib/api';
import { ComposeScreen } from './ComposeScreen';
import { ConnectionsScreen } from './ConnectionsScreen';
import { PostsScreen } from './PostsScreen';
import { Badge, Card } from '../components/ui';

/**
 * Application shell.
 *
 * Navigation is local state rather than a router: the app is a handful of
 * views behind one auth gate, and Capacitor wraps it as a single screen. A
 * router can be added when deep links start to matter.
 */

interface Props {
  session: Session;
  onSignOut: () => void;
}

type TabKey = 'compose' | 'posts' | 'channels' | 'creatives' | 'whatsapp' | 'ads';

const TABS: { key: TabKey; label: string; icon: string; ready: boolean }[] = [
  { key: 'compose', label: 'Compose', icon: '✎', ready: true },
  { key: 'posts', label: 'Posts', icon: '☰', ready: true },
  { key: 'channels', label: 'Channels', icon: '⚯', ready: true },
  { key: 'creatives', label: 'Creatives', icon: '▣', ready: false },
  { key: 'whatsapp', label: 'WhatsApp', icon: '✆', ready: false },
  { key: 'ads', label: 'Ads', icon: '◎', ready: false },
];

const COMING_SOON: Record<string, string> = {
  creatives: 'Fill in a template and get a finished image or video ad in every size you need.',
  whatsapp: 'Opt-in contact lists, approved message templates and throttled campaigns.',
  ads: 'Meta and Google campaigns. Unlocks once the ads API applications are approved.',
};

export function DashboardScreen({ session, onSignOut }: Props) {
  const [tab, setTab] = useState<TabKey>('compose');
  // Bumping this forces the posts list to refetch after a publish.
  const [postsKey, setPostsKey] = useState(0);

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              SB
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {session.organization.name}
              </p>
              <p className="truncate text-xs text-slate-500">{session.user.name}</p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>

        <nav className="mx-auto w-full max-w-3xl overflow-x-auto px-5">
          <ul className="flex gap-1 pb-2">
            {TABS.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => setTab(item.key)}
                  aria-current={tab === item.key ? 'page' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                    tab === item.key
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                  {!item.ready && <span className="text-xs text-slate-400">·</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        {tab === 'compose' && <ComposeScreen onPublished={() => setPostsKey((k) => k + 1)} />}
        {tab === 'posts' && <PostsScreen key={postsKey} />}
        {tab === 'channels' && <ConnectionsScreen />}
        {(tab === 'creatives' || tab === 'whatsapp' || tab === 'ads') && (
          <Card>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-900">
                {TABS.find((t) => t.key === tab)?.label}
              </h2>
              <Badge>Building</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600">{COMING_SOON[tab]}</p>
          </Card>
        )}
      </main>
    </div>
  );
}
