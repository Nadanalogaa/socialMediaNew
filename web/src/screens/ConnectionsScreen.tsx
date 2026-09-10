import { useEffect, useState } from 'react';
import {
  ApiError,
  api,
  type AvailablePage,
  type Connection,
} from '../lib/api';
import { facebookLogin, loadFacebookSdk } from '../lib/facebook';
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

  const appId = import.meta.env.VITE_META_APP_ID as string | undefined;

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const { connections } = await api.listConnections();
      setConnections(connections);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load connections.');
      setConnections([]);
    }
  }

  async function handleConnect() {
    setError(null);
    if (!appId) {
      setError('VITE_META_APP_ID is not set. Add it to .env and restart the dev server.');
      return;
    }

    setBusy(true);
    try {
      await loadFacebookSdk(appId);
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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Connected channels</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Link the Facebook Pages and Instagram accounts you post to.
          </p>
        </div>
        <Button onClick={handleConnect} disabled={busy}>
          {busy ? 'Working…' : 'Connect Facebook'}
        </Button>
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
                {!page.instagram && (
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
                  <p className="text-xs text-slate-500">{providerLabel(connection.provider)}</p>
                  {connection.status !== 'active' && connection.lastError && (
                    <p className="mt-1 text-xs text-red-600">{connection.lastError}</p>
                  )}
                </div>
                <Badge tone={connection.status === 'active' ? 'success' : 'danger'}>
                  {connection.status === 'active' ? 'Active' : 'Reconnect needed'}
                </Badge>
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
