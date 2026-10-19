import { daysUntil, formatDateTime } from '../lib/dates';
import { useEffect, useState } from 'react';
import {
  ApiError,
  api,
  type AvailablePage,
  type Connection,
} from '../lib/api';
import {
  facebookLogin,
  isInstagramEnabled,
  loadFacebookSdk,
  usesBusinessLogin,
} from '../lib/facebook';
import { Alert, Badge, Button, Card, EmptyState, Spinner, providerLabel } from '../components/ui';

/**
 * Explains why a Page shows no Instagram account, and how to fix it.
 *
 * The Graph API simply reports absence, so we cannot tell which of the two
 * causes applies. Both are shown, because "no Instagram account linked" with
 * no further guidance is the single largest source of onboarding confusion.
 */
function InstagramHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        {open ? 'Hide' : 'Why is my Instagram not showing?'}
      </button>

      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          <p className="font-medium text-slate-900">Instagram needs two things to appear here:</p>
          <ol className="mt-1.5 list-decimal space-y-2 pl-4">
            <li>
              <span className="font-medium">It must be a Business or Creator account.</span>
              <br />
              In the Instagram app: <em>Settings and privacy → Account type and tools → Switch to
              professional account</em>. A personal account cannot be published to by any tool.
            </li>
            <li>
              <span className="font-medium">It must be linked to this Facebook Page.</span>
              <br />
              In the Instagram app: <em>Settings and privacy → Account type and tools → Sharing to
              other apps → Facebook</em>, and pick this Page. You can also do it from the Page's
              settings on Facebook under <em>Linked accounts</em>.
            </li>
          </ol>
          <p className="mt-2">
            After linking, come back and press <span className="font-medium">Connect Facebook</span>{' '}
            again — the list is read fresh each time.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Connecting channels.
 *
 * The page picker is the important part: the user sees every Page they
 * administer, which Instagram account each one carries, and chooses. Nothing
 * is connected implicitly.
 */
export function ConnectionsScreen() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [pages, setPages] = useState<AvailablePage[] | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Google sends the browser back here with the outcome in the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('google');
    if (!outcome) return;
    if (outcome === 'connected') {
      const locations = Number(params.get('locations') ?? 0);
      const sites = Number(params.get('sites') ?? 0);
      setCheckNotice(
        `Google connected: ${locations} Business Profile${locations === 1 ? '' : 's'}, ${sites} Search Console propert${sites === 1 ? 'y' : 'ies'}.` +
          (params.get('businessProfile') === 'unavailable'
            ? ' Business Profile listings could not be read yet — the Google API access for this app is still pending.'
            : ''),
      );
    } else {
      setError(`Google connection ${outcome === 'denied' ? 'was cancelled' : 'failed'}: ${params.get('reason') ?? ''}`);
    }
    window.history.replaceState(null, '', '/app');
  }, []);

  async function handleConnectGoogle() {
    setGoogleBusy(true);
    setError(null);
    try {
      const { authUrl } = await api.startGoogleConnection();
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start Google sign-in.');
      setGoogleBusy(false);
    }
  }

  const appId = import.meta.env.VITE_META_APP_ID as string | undefined;

  /** Asks Meta whether every token still works; the cards update from the answer. */
  async function checkAll() {
    setChecking(true);
    setError(null);
    setCheckNotice(null);
    try {
      const { results } = await api.checkConnections();
      const bad = results.filter((r) => r.status !== 'active');
      setCheckNotice(
        bad.length === 0
          ? `All ${results.length} channel${results.length === 1 ? '' : 's'} are working.`
          : `${bad.length} of ${results.length} need attention: ${bad.map((r) => r.displayName).join(', ')}.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check the channels.');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  /**
   * Load the SDK up front rather than on click.
   *
   * Browsers only allow a pop-up to open from a user gesture, and awaiting the
   * script download inside the click handler ends that gesture — so the
   * Facebook window is blocked before it appears.
   */
  useEffect(() => {
    if (!appId) return;
    loadFacebookSdk(appId)
      .then(() => setSdkReady(true))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load the Facebook SDK.'),
      );
  }, [appId]);

  async function refresh() {
    try {
      const { connections } = await api.listConnections();
      setConnections(connections);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load connections.');
      setConnections([]);
    }
  }

  function handleConnect() {
    setError(null);
    if (!appId) {
      setError('VITE_META_APP_ID is not set. Add it to .env and restart the dev server.');
      return;
    }
    if (!sdkReady) {
      setError('Facebook is still loading. Give it a moment and try again.');
      return;
    }

    setBusy(true);
    // Called without awaiting anything first, so the pop-up still counts as
    // opened by the click. The rest of the work happens in the promise chain.
    void completeConnect();
  }

  async function completeConnect() {
    try {
      const userToken = await facebookLogin();
      const result = await api.beginMetaConnection(userToken);
      setHandle(result.handle);
      setPages(result.pages);
      // Pre-select everything: connecting all pages is the common case.
      setSelected(new Set(result.pages.map((page) => page.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to Facebook.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!handle || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.completeMetaConnection(handle, [...selected]);
      setPages(null);
      setHandle(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the selected pages.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect(id: string, name: string) {
    if (!confirm(`Disconnect ${name}? Scheduled posts to it will fail.`)) return;
    try {
      await api.disconnect(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not disconnect.');
    }
  }

  function toggle(pageId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Connected channels</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Facebook Pages and Instagram accounts you post to; your Google Business Profile and website for Google promotion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleConnect} disabled={busy || (Boolean(appId) && !sdkReady)}>
            {busy ? 'Working…' : !sdkReady && appId ? 'Loading…' : 'Connect Facebook'}
          </Button>
          <Button variant="secondary" onClick={() => void handleConnectGoogle()} disabled={googleBusy}>
            {googleBusy ? 'Opening Google…' : 'Connect Google'}
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          What you need before connecting
        </summary>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>
            A Facebook <span className="font-medium">Page</span> — a personal profile will not work.
          </li>
          <li>
            An <span className="font-medium">admin</span> role on that Page. Editor is not enough to
            grant publishing access.
          </li>
          <li>
            For Instagram: a <span className="font-medium">Business or Creator</span> account that is
            linked to the Page.
          </li>
        </ul>
      </details>

      {!isInstagramEnabled && !usesBusinessLogin && (
        <Alert tone="info">
          Instagram is not enabled on this app yet, so only Facebook Pages can be connected.
          Add an Instagram use case in the Meta app dashboard, then set{' '}
          <code>VITE_META_INSTAGRAM_ENABLED=true</code> to request those permissions.
        </Alert>
      )}

      {!appId && (
        <Alert tone="warning">
          Facebook connection needs <code>VITE_META_APP_ID</code> in <code>.env</code>. Until your
          Meta app has Advanced Access approved, only its developers and test users can connect.
        </Alert>
      )}

      {/* Page picker, shown after Facebook sign-in succeeds. */}
      {pages && (
        <Card>
          <h3 className="font-medium text-slate-900">Choose what to connect</h3>
          <p className="mt-0.5 mb-3 text-sm text-slate-600">
            {pages.length} page{pages.length === 1 ? '' : 's'} found on your Facebook account.
          </p>
          <ul className="space-y-2">
            {pages.map((page) => (
              <li key={page.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(page.id)}
                    onChange={() => toggle(page.id)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {page.pictureUrl && (
                    <img src={page.pictureUrl} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {page.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {page.instagram
                        ? `Includes Instagram @${page.instagram.username}`
                        : 'No Instagram account linked'}
                    </span>
                  </span>
                </label>
                {!page.instagram && isInstagramEnabled && (
                  <div className="pl-10">
                    <InstagramHelp />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={busy || selected.size === 0}>
              {busy ? 'Saving…' : `Connect ${selected.size} page${selected.size === 1 ? '' : 's'}`}
            </Button>
            <Button variant="secondary" onClick={() => setPages(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {connections && connections.length > 0 && (() => {
        const attention = connections.filter(
          (c) => c.status !== 'active' || (c.tokenExpiresAt && daysUntil(c.tokenExpiresAt) <= 10),
        );
        return (
          <Card className={attention.length > 0 ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {attention.length === 0
                    ? `All ${connections.length} channel${connections.length === 1 ? '' : 's'} healthy`
                    : `${attention.length} channel${attention.length === 1 ? '' : 's'} need${attention.length === 1 ? 's' : ''} attention`}
                </p>
                <p className="text-xs text-slate-600">
                  {attention.length === 0
                    ? 'Tokens are checked daily; scheduled posts will go out.'
                    : 'Press Reconnect on the flagged channel and sign in to Facebook again.'}
                </p>
              </div>
              <Button variant="secondary" onClick={() => void checkAll()} disabled={checking}>
                {checking ? 'Checking…' : 'Check now'}
              </Button>
            </div>
            {checkNotice && <p className="mt-2 text-xs text-slate-700">{checkNotice}</p>}
          </Card>
        );
      })()}

      {connections === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          title="No channels connected yet"
          hint="Connect a Facebook Page to start publishing."
        />
      ) : (
        <ul className="space-y-2">
          {connections.map((connection) => (
            <li key={connection.id}>
              <Card className="flex items-center gap-3">
                {connection.avatarUrl ? (
                  <img src={connection.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600">
                    {connection.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {connection.displayName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {providerLabel(connection.provider)}
                    {connection.lastCheckedAt && ` · checked ${formatDateTime(connection.lastCheckedAt)}`}
                    {connection.tokenExpiresAt && ` · access until ${new Date(connection.tokenExpiresAt).toLocaleDateString()}`}
                  </p>
                  {connection.status !== 'active' && connection.lastError && (
                    <p className="mt-1 text-xs text-red-600">{connection.lastError}</p>
                  )}
                </div>
                {(connection.status !== 'active' ||
                  (connection.tokenExpiresAt && daysUntil(connection.tokenExpiresAt) <= 10)) && (
                  <Button
                    onClick={() =>
                      connection.provider.startsWith('google') || connection.provider === 'youtube_channel'
                        ? void handleConnectGoogle()
                        : handleConnect()
                    }
                    disabled={
                      connection.provider.startsWith('google') || connection.provider === 'youtube_channel'
                        ? googleBusy
                        : busy || !sdkReady
                    }
                  >
                    Reconnect
                  </Button>
                )}
                {(() => {
                  const days = connection.tokenExpiresAt ? daysUntil(connection.tokenExpiresAt) : null;
                  if (connection.status !== 'active') return <Badge tone="danger">Reconnect needed</Badge>;
                  if (days !== null && days <= 0) return <Badge tone="danger">Access expired</Badge>;
                  if (days !== null && days <= 10) return <Badge tone="warning">Expires in {days}d</Badge>;
                  return <Badge tone="success">Active</Badge>;
                })()}
                <Button
                  variant="danger"
                  onClick={() => handleDisconnect(connection.id, connection.displayName)}
                >
                  Remove
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
