/**
 * Transactional email through Brevo's REST API (free tier: 300 a day).
 *
 * Used for the weekly digest, invitations and account mail. When no key is
 * configured the caller gets `false` back and carries on; email is never
 * what a feature depends on to work.
 */

import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export interface Mail {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  text?: string;
}

function parseFrom(from: string): { email: string; name?: string } {
  const match = /^(.*)<([^>]+)>\s*$/.exec(from);
  return match ? { name: match[1]!.trim().replace(/^"|"$/g, '') || undefined, email: match[2]!.trim() } : { email: from.trim() };
}

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!env.BREVO_API_KEY) return false;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: parseFrom(env.EMAIL_FROM),
      to: mail.to,
      subject: mail.subject,
      htmlContent: mail.html,
      ...(mail.text ? { textContent: mail.text } : {}),
    }),
  });
  if (!response.ok) {
    logger.warn({ status: response.status, body: (await response.text()).slice(0, 300) }, 'Brevo rejected the email');
    return false;
  }
  return true;
}
