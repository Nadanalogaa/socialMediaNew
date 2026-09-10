/**
 * Small shared primitives. Kept deliberately few — the app leans on Tailwind
 * utilities directly rather than growing a component library it doesn't need.
 */

import type { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
    danger: 'border border-red-300 text-red-700 hover:bg-red-50',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const TONE_STYLES = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
} as const;

export type Tone = keyof typeof TONE_STYLES;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_STYLES[tone]}`}>
      {children}
    </span>
  );
}

/** Maps a post or target status to the colour it should read as. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'published':
      return 'success';
    case 'failed':
      return 'danger';
    case 'partially_failed':
      return 'warning';
    case 'publishing':
    case 'scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

export function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: Tone }) {
  const styles = {
    danger: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone];

  return (
    <div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

/** Human label for a provider key. */
export function providerLabel(provider: string): string {
  return (
    {
      facebook_page: 'Facebook Page',
      instagram_business: 'Instagram',
      youtube_channel: 'YouTube',
      whatsapp_business: 'WhatsApp',
      meta_ads: 'Meta Ads',
      google_ads: 'Google Ads',
    }[provider] ?? provider
  );
}
