import { useState } from 'react';
import { setActiveOrganization, type MediaAsset, type Organization, type Session } from '../lib/api';
import { OrganizationSwitcher } from '../components/OrganizationSwitcher';
import { BottomNav } from '../components/BottomNav';
import { ComposeScreen } from './ComposeScreen';
import { ConnectionsScreen } from './ConnectionsScreen';
import { CreativesScreen } from './CreativesScreen';
import { ReelsScreen } from './ReelsScreen';
import { AnalyticsScreen } from './AnalyticsScreen';
import { LibraryScreen } from './LibraryScreen';
import { PostsScreen } from './PostsScreen';
import { IdeasScreen } from './IdeasScreen';
import { BrandScreen } from './BrandScreen';
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
  onSessionChange: (session: Session) => void;
}

type TabKey =
  | 'compose'
  | 'posts'
  | 'ideas'
  | 'analytics'
  | 'channels'
  | 'creatives'
  | 'reels'
  | 'library'
  | 'brand'
  | 'whatsapp'
  | 'ads';

const TABS: { key: TabKey; label: string; icon: string; ready: boolean }[] = [
  { key: 'compose', label: 'Compose', icon: '✎', ready: true },
  { key: 'posts', label: 'Posts', icon: '☰', ready: true },
  { key: 'ideas', label: 'Ideas', icon: '💡', ready: true },
  { key: 'analytics', label: 'Analytics', icon: '◳', ready: true },
  { key: 'channels', label: 'Channels', icon: '⚯', ready: true },
  { key: 'creatives', label: 'Posters', icon: '▣', ready: true },
  { key: 'reels', label: 'Reels', icon: '▶', ready: true },
  { key: 'library', label: 'My designs', icon: '❑', ready: true },
  { key: 'brand', label: 'Brand kit', icon: '◆', ready: true },
  { key: 'whatsapp', label: 'WhatsApp', icon: '✆', ready: false },
  { key: 'ads', label: 'Ads', icon: '◎', ready: false },
];

/** Shown in the mobile bar; the rest live behind "More". */
const PRIMARY_MOBILE_TABS: TabKey[] = ['compose', 'reels', 'posts', 'library'];

const COMING_SOON: Record<string, string> = {
  whatsapp: 'Opt-in contact lists, approved message templates and throttled campaigns.',
  ads: 'Meta and Google campaigns. Unlocks once the ads API applications are approved.',
};

export function DashboardScreen({ session, onSignOut, onSessionChange }: Props) {
  const [tab, setTab] = useState<TabKey>('compose');
  // Bumping this forces the posts list to refetch after a publish.
  const [postsKey, setPostsKey] = useState(0);
  /** Carried from the reel editor so Publish opens Compose ready to go. */
  const [pendingAsset, setPendingAsset] = useState<MediaAsset | null>(null);
  /** Set when opening a saved design from the library. */
  const [openDesignId, setOpenDesignId] = useState<string | undefined>();
  /** Set when editing a post from the Posts screen. */
  const [editingPostId, setEditingPostId] = useState<string | undefined>();
  /** Carried from an idea into the composer or Magic Design. */
  const [pendingCaption, setPendingCaption] = useState<string | undefined>();
  const [pendingBrief, setPendingBrief] = useState<string | undefined>();

  function handleSwitch(organization: Organization) {
    onSessionChange(setActiveOrganization(session, organization));
    // Every screen is scoped to the workspace, so send them back to a neutral one.
    setTab('channels');
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        {/* Everything on one line: the nav used to take a second row that the
            editor needed more than the navigation did. */}
        <div className="mx-auto flex w-full max-w-[1700px] items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              SB
            </div>
            <OrganizationSwitcher session={session} onSwitch={handleSwitch} />
          </div>

          <nav className="hidden min-w-0 flex-1 overflow-x-auto lg:block">
            <ul className="flex gap-0.5">
              {TABS.map((item) => (
                <li key={item.key}>
                  <button
                    onClick={() => {
                      setTab(item.key);
                      if (item.key !== 'library') setOpenDesignId(undefined);
                      if (item.key === 'compose') setEditingPostId(undefined);
                      setPendingCaption(undefined);
                      setPendingBrief(undefined);
                    }}
                    aria-current={tab === item.key ? 'page' : undefined}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${
                      tab === item.key
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span aria-hidden className="text-xs">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <button
            onClick={onSignOut}
            className="ml-auto hidden shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 lg:block"
          >
            Sign out
          </button>
          <span className="ml-auto text-sm font-medium text-slate-500 lg:hidden">
            {TABS.find((item) => item.key === tab)?.label}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] flex-1 px-4 py-3 pb-24 lg:pb-4">
        {tab === 'compose' && (
          <ComposeScreen
            key={`${session.organization.id}:${editingPostId ?? 'new'}:${pendingCaption ?? ''}`}
            initialAsset={pendingAsset}
            initialCaption={pendingCaption}
            editingPostId={editingPostId}
            onPublished={() => setPostsKey((k) => k + 1)}
            onViewPosts={() => {
              setPendingAsset(null);
              setEditingPostId(undefined);
              setTab('posts');
            }}
          />
        )}
        {tab === 'posts' && (
          <PostsScreen
            key={`${session.organization.id}:${postsKey}`}
            onEdit={(post) => {
              setEditingPostId(post.id);
              setTab('compose');
            }}
            onCompose={() => {
              setEditingPostId(undefined);
              setTab('compose');
            }}
          />
        )}
        {tab === 'ideas' && (
          <IdeasScreen
            key={session.organization.id}
            onMakePost={(idea) => {
              setEditingPostId(undefined);
              setPendingCaption([idea.title, idea.notes, idea.url].filter(Boolean).join('\n\n'));
              setPendingAsset(idea.media ? { ...idea.media, width: null, height: null } : null);
              setTab('compose');
            }}
            onMakeReel={(idea) => {
              setOpenDesignId(undefined);
              setPendingBrief(`Scene 1 - ${idea.title}\n${idea.title}\n${idea.notes ?? ''}`.trim());
              setTab('reels');
            }}
          />
        )}
        {tab === 'brand' && <BrandScreen key={session.organization.id} />}
        {tab === 'channels' && <ConnectionsScreen key={session.organization.id} />}
        {tab === 'creatives' && (
          <CreativesScreen
            key={`${session.organization.id}:${openDesignId ?? 'new'}`}
            openDesignId={openDesignId}
          />
        )}
        {tab === 'reels' && (
          <ReelsScreen
            key={`${session.organization.id}:${openDesignId ?? 'new'}:${pendingBrief ?? ''}`}
            openDesignId={openDesignId}
            initialBrief={pendingBrief}
            onPublish={(asset) => {
              setPendingAsset(asset);
              setTab('compose');
            }}
          />
        )}
        {tab === 'library' && (
          <LibraryScreen
            key={session.organization.id}
            onOpen={(design) => {
              setOpenDesignId(design.id);
              setTab(design.kind === 'video' ? 'reels' : 'creatives');
            }}
          />
        )}
        {tab === 'analytics' && <AnalyticsScreen key={session.organization.id} />}
        {(tab === 'whatsapp' || tab === 'ads') && (
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

      <BottomNav
        primary={TABS.filter((item) => PRIMARY_MOBILE_TABS.includes(item.key)).map((item) => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
        }))}
        overflow={TABS.filter((item) => !PRIMARY_MOBILE_TABS.includes(item.key)).map((item) => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
        }))}
        active={tab}
        onSelect={(key) => {
          setTab(key as TabKey);
          if (key !== 'library') setOpenDesignId(undefined);
          if (key === 'compose') setEditingPostId(undefined);
          setPendingCaption(undefined);
          setPendingBrief(undefined);
        }}
        onSignOut={onSignOut}
      />
    </div>
  );
}
