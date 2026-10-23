/**
 * Nudges: the handful of things a business should do this week, worked out
 * from its own data, shown on Home and sent as a weekly digest.
 *
 * Each nudge names one concrete action. A list of ten vague tips is noise;
 * "reply to 2 reviews" and "nothing posted for 9 days" get done.
 */

import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { connections, memberships, organizations, posts, users } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { sendMail } from '../../integrations/brevo.js';
import { env } from '../../lib/env.js';
import { locationReport, overview as googleOverview } from '../google/service.js';

const DAY = 86_400_000;

export interface Nudge {
  key: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  /** Where in the app to go and do it. */
  tab: 'posts' | 'compose' | 'channels' | 'google' | 'reels' | 'brand' | 'inbox';
}

export async function computeNudges(organizationId: string, options: { includeGoogle?: boolean } = {}): Promise<Nudge[]> {
  const now = Date.now();
  const nudges: Nudge[] = [];

  const [broken, pending, failed, scheduled, lastPost] = await Promise.all([
    db
      .select({ displayName: connections.displayName })
      .from(connections)
      .where(and(eq(connections.organizationId, organizationId), sql`${connections.status} <> 'active'`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'pending_approval'))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), inArray(posts.status, ['failed', 'partially_failed']), gte(posts.updatedAt, new Date(now - 7 * DAY)))),
    db
      .select({ at: posts.scheduledAt })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'scheduled'), isNotNull(posts.scheduledAt), gte(posts.scheduledAt, new Date()))),
    db
      .select({ at: posts.publishedAt })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.status, 'published'), isNotNull(posts.publishedAt)))
      .orderBy(desc(posts.publishedAt))
      .limit(1),
  ]);

  for (const c of broken) {
    nudges.push({ key: `reconnect:${c.displayName}`, severity: 'high', title: `Reconnect ${c.displayName}`, detail: 'Posts to it will fail until you sign in to it again.', tab: 'channels' });
  }
  if ((failed[0]?.n ?? 0) > 0) {
    nudges.push({ key: 'failed', severity: 'high', title: `${failed[0]!.n} post${failed[0]!.n === 1 ? '' : 's'} failed this week`, detail: 'Open Posts → Needs attention to see why, then publish again.', tab: 'posts' });
  }
  if ((pending[0]?.n ?? 0) > 0) {
    nudges.push({ key: 'pending', severity: 'medium', title: `${pending[0]!.n} post${pending[0]!.n === 1 ? '' : 's'} waiting for approval`, detail: 'Approve or send back, so they go out on time.', tab: 'posts' });
  }

  const daysCovered = new Set(scheduled.map((p) => p.at!.toISOString().slice(0, 10))).size;
  if (daysCovered < 3) {
    nudges.push({
      key: 'runway',
      severity: daysCovered === 0 ? 'medium' : 'low',
      title: daysCovered === 0 ? 'Nothing is scheduled' : `Only ${daysCovered} day${daysCovered === 1 ? '' : 's'} of posts queued`,
      detail: 'Add two or three posts to the queue so the week is covered.',
      tab: 'compose',
    });
  }
  const sinceLast = lastPost[0]?.at ? Math.floor((now - lastPost[0].at.getTime()) / DAY) : null;
  if (sinceLast === null || sinceLast >= 7) {
    nudges.push({
      key: 'quiet',
      severity: 'medium',
      title: sinceLast === null ? 'No post published yet' : `No post in ${sinceLast} days`,
      detail: 'Accounts that post weekly are shown more. A reel from Magic Design takes three minutes.',
      tab: 'reels',
    });
  }

  if (options.includeGoogle !== false) {
    try {
      const g = await googleOverview(organizationId);
      for (const loc of g.locations) {
        if (loc.error) continue;
        if (loc.reviews.unanswered > 0) {
          nudges.push({ key: `reviews:${loc.connectionId}`, severity: 'high', title: `Reply to ${loc.reviews.unanswered} Google review${loc.reviews.unanswered === 1 ? '' : 's'} · ${loc.title}`, detail: 'Google ranks listings that answer their reviews; it takes a minute each.', tab: 'google' });
        }
        for (const item of loc.items.filter((i) => !i.ok && i.points >= 10).slice(0, 2)) {
          nudges.push({ key: `score:${loc.connectionId}:${item.key}`, severity: 'medium', title: `${item.label} · ${loc.title}`, detail: item.fix, tab: 'google' });
        }
      }
      for (const a of g.analytics) {
        if (a.tag && a.tag.installed === false) {
          nudges.push({ key: `tag:${a.connectionId}`, severity: 'low', title: `Website analytics tag missing on ${a.tag.siteUrl}`, detail: 'Visitors are not being counted. The Google tab has the snippet to paste.', tab: 'google' });
        }
      }
    } catch (error) {
      logger.warn({ err: error, organizationId }, 'Google nudges unavailable');
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return nudges.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
}

/** The weekly digest, to every owner and admin, where email is configured. */
export async function sendWeeklyDigests(): Promise<{ organizations: number; sent: number }> {
  if (!env.BREVO_API_KEY) return { organizations: 0, sent: 0 };
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  let sent = 0;
  for (const org of orgs) {
    try {
      const nudges = await computeNudges(org.id);
      if (nudges.length === 0) continue;
      const people = await db
        .select({ email: users.email, name: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.organizationId, org.id), inArray(memberships.role, ['owner', 'admin'])));
      if (people.length === 0) continue;
      const ok = await sendMail({
        to: people.map((p) => ({ email: p.email, name: p.name })),
        subject: `${org.name}: ${nudges.length} thing${nudges.length === 1 ? '' : 's'} to do this week`,
        html: digestHtml(org.name, nudges),
        text: nudges.map((n) => `• ${n.title} — ${n.detail}`).join('\n'),
      });
      if (ok) sent++;
    } catch (error) {
      logger.warn({ err: error, organizationId: org.id }, 'Digest failed');
    }
  }
  logger.info({ organizations: orgs.length, sent }, 'Weekly digests sent');
  return { organizations: orgs.length, sent };
}

function digestHtml(orgName: string, nudges: Nudge[]): string {
  const colour = { high: '#dc2626', medium: '#d97706', low: '#64748b' };
  const items = nudges
    .map(
      (n) =>
        `<li style="margin:0 0 12px"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${colour[n.severity]};margin-right:8px"></span><strong>${escape(n.title)}</strong><br><span style="color:#475569">${escape(n.detail)}</span></li>`,
    )
    .join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 4px">This week for ${escape(orgName)}</h2>
  <p style="margin:0 0 20px;color:#64748b">Small things that move you up on Google and keep your followers engaged.</p>
  <ul style="list-style:none;padding:0;margin:0 0 24px">${items}</ul>
  <a href="${env.APP_URL}/app" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Open PostReels</a>
  <p style="margin-top:24px;font-size:12px;color:#94a3b8">You get this once a week because you own or administer this workspace.</p>
</div>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

void locationReport;
