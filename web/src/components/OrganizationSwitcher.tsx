import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type Organization, type Session } from '../lib/api';

/**
 * Workspace switcher.
 *
 * Each client an agency manages is a separate organization, so switching is
 * how you move between them — and the only thing that stops a post intended
 * for one client reaching another's Page.
 */
export function OrganizationSwitcher({
  session,
  onSwitch,
}: {
  session: Session;
  onSwitch: (organization: Organization) => void;
}) {
  const [open, setOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>(
    session.organizations ?? [session.organization],
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sessions stored before this feature existed carry no list, so fetch one.
  useEffect(() => {
    if (!open) return;
    api
      .listOrganizations()
      .then(({ organizations }) => setOrganizations(organizations))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const organization = await api.createOrganization(name);
      setOrganizations((prev) => [...prev, organization]);
      setNewName('');
      setCreating(false);
      setOpen(false);
      onSwitch(organization);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the workspace.');
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left transition hover:bg-slate-100"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {session.organization.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {session.user.name} · {session.organization.role}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xs text-slate-400">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            Workspaces
          </p>

          {organizations.map((organization) => {
            const active = organization.id === session.organization.id;
            return (
              <button
                key={organization.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) onSwitch(organization);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-100 ${
                  active ? 'font-medium text-brand-700' : 'text-slate-700'
                }`}
              >
                <span className="min-w-0 truncate">{organization.name}</span>
                {active && <span aria-hidden>✓</span>}
              </button>
            );
          })}

          <div className="mt-1 border-t border-slate-100 pt-1">
            {creating ? (
              <div className="p-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
                  placeholder="Client or business name"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                <div className="mt-1.5 flex gap-1">
                  <button
                    onClick={() => void handleCreate()}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false);
                      setError(null);
                    }}
                    className="rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100"
              >
                + Add a workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
