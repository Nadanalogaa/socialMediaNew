import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS } from '@socialboost/shared';
import { ApiError, api, type Invitation, type Member, type Session } from '../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

const ROLE_HELP: Record<string, string> = {
  owner: 'Everything, including billing and removing the workspace.',
  admin: 'Publishes, approves, manages channels and the team.',
  member: 'Creates posts and designs. Submits for approval when that is on.',
  viewer: 'A client: sees posts and reports, and can approve.',
};

/**
 * The team.
 *
 * Invitations are links rather than emails — copy one into WhatsApp. Whoever
 * opens it signs in (or up) and joins at the invited role.
 */
export function TeamScreen({ session }: { session: Session }) {
  const role = session.organization.role;
  const manages = role === 'owner' || role === 'admin';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [requireApproval, setRequireApproval] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [created, setCreated] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { members } = await api.listMembers();
      setMembers(members);
      if (manages) {
        const [{ invitations }, settings] = await Promise.all([api.listInvitations(), api.getSettings()]);
        setInvitations(invitations);
        setRequireApproval(settings.requireApproval);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the team.');
      setMembers([]);
    }
  }, [manages]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const invitation = await api.createInvitation({ email: email.trim(), role: inviteRole });
      setCreated(invitation);
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this link:', link);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  if (members === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading team…
      </div>
    );
  }

  const pending = invitations.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Team</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Who works in <strong>{session.organization.name}</strong>, and what they may do.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {manages && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-slate-900">Invite someone</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="their@email.com"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {(['member', 'admin', 'viewer'] as const).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <Button onClick={() => void invite()} disabled={busy || !email.trim()}>
              Create invite link
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{ROLE_HELP[inviteRole]}</p>

          {created && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-medium text-emerald-900">Invite link for {created.email}</p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-800">{created.link}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button className="!py-1 !text-xs" onClick={() => void copy(created.link)}>
                  {copied ? 'Copied ✓' : 'Copy link'}
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`You're invited to ${session.organization.name} on SocialBoost: ${created.link}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-white"
                >
                  Share on WhatsApp
                </a>
              </div>
              <p className="mt-1.5 text-xs text-emerald-800">
                Valid for 14 days. They sign in or create an account, and join automatically.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h3 className="mb-2 text-sm font-medium text-slate-900">Members</h3>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => {
            const isSelf = m.userId === session.user.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-900">
                    {m.name} {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                {manages && m.role !== 'owner' && !isSelf ? (
                  <select
                    value={m.role}
                    onChange={(e) => void run(() => api.setMemberRole(m.userId, e.target.value))}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    {(['admin', 'member', 'viewer'] as const).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}</Badge>
                )}
                {manages && m.role !== 'owner' && !isSelf && (
                  <Button
                    variant="danger"
                    className="!px-2.5 !py-1 !text-xs"
                    onClick={() => confirm(`Remove ${m.name} from this workspace?`) && void run(() => api.removeMember(m.userId))}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {manages && (
        <>
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-900">Pending invitations</h3>
            {pending.length === 0 ? (
              <EmptyState title="No open invitations" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-900">{i.email}</span>
                    <Badge>{ROLE_LABELS[i.role as keyof typeof ROLE_LABELS] ?? i.role}</Badge>
                    <span className="text-xs text-slate-500">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                    <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => void copy(i.link)}>
                      Copy link
                    </Button>
                    <Button variant="danger" className="!px-2.5 !py-1 !text-xs" onClick={() => void run(() => api.deleteInvitation(i.id))}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={requireApproval ?? false}
                disabled={requireApproval === null}
                onChange={(e) => {
                  const next = e.target.checked;
                  setRequireApproval(next);
                  void run(() => api.updateSettings({ requireApproval: next }));
                }}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Posts need approval before publishing</span>
                <span className="block text-xs text-slate-600">
                  Members submit their posts; an owner, admin or client approves (which publishes or schedules it)
                  or sends it back with a note.
                </span>
              </span>
            </label>
          </Card>
        </>
      )}
    </div>
  );
}
