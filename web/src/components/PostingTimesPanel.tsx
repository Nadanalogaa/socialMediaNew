import { useEffect, useState } from 'react';
import { ApiError, api, type BestTimesReport, type PostingSlot } from '../lib/api';
import { WEEKDAY_SHORT } from '../lib/dates';
import { Alert, Button, Spinner } from './ui';

const COMMON_ZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

/**
 * The organisation's queue: which times of which days posts go out, and what
 * history says the best times have been.
 */
export function PostingTimesPanel({ onClose }: { onClose: () => void }) {
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [slots, setSlots] = useState<PostingSlot[] | null>(null);
  const [best, setBest] = useState<BestTimesReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setTimezone(s.timezone);
        setSlots(s.postingSlots);
      })
      .catch(() => setSlots([]));
    api.bestTimes().then(setBest).catch(() => setBest(null));
  }, []);

  function updateSlot(index: number, patch: Partial<PostingSlot>) {
    setSlots((prev) => (prev ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function save() {
    if (!slots) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings({
        timezone,
        postingSlots: slots.filter((s) => s.days.length > 0 && /^\d{2}:\d{2}$/.test(s.time)),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const zones = COMMON_ZONES.includes(timezone) ? COMMON_ZONES : [timezone, ...COMMON_ZONES];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Posting times</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            "Add to queue" in the composer picks the next free one of these.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
          ✕
        </button>
      </div>

      {error && <Alert>{error}</Alert>}

      <label className="block text-xs font-medium text-slate-700">
        Time zone
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      {slots === null ? (
        <Spinner className="mt-3 h-4 w-4 text-slate-400" />
      ) : (
        <ul className="mt-3 space-y-2">
          {slots.map((slot, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
              <input
                type="time"
                value={slot.time}
                onChange={(e) => updateSlot(index, { time: e.target.value })}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const on = slot.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        updateSlot(index, {
                          days: on ? slot.days.filter((d) => d !== day) : [...slot.days, day],
                        })
                      }
                      className={`h-7 w-8 rounded-md text-[11px] font-medium ${
                        on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {WEEKDAY_SHORT[day]!.slice(0, 2)}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setSlots((prev) => (prev ?? []).filter((_, i) => i !== index))}
                className="ml-auto text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
          {slots.length === 0 && (
            <li className="text-xs text-slate-500">
              No times set — the queue uses 09:00 and 19:30 every day until you add your own.
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="!py-1 !text-xs"
          onClick={() => setSlots((prev) => [...(prev ?? []), { days: [1, 2, 3, 4, 5], time: '09:00' }])}
        >
          + Add a time
        </Button>
        <Button className="!py-1 !text-xs" onClick={() => void save()} disabled={saving || slots === null}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </Button>
      </div>

      {best && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="text-xs font-semibold text-slate-900">Best times to post</h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {best.basis === 'history'
              ? 'From the engagement your published posts have earned.'
              : 'Typical peaks for an Indian audience. Your own pattern appears after five published posts.'}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {best.times.map((t) => (
              <li key={t.label}>
                <button
                  type="button"
                  onClick={() =>
                    setSlots((prev) => [
                      ...(prev ?? []),
                      { days: [t.weekday], time: `${String(t.hour).padStart(2, '0')}:00` },
                    ])
                  }
                  title="Add as a posting time"
                  className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {t.label}
                  {t.samples > 0 ? ` · ${t.samples} post${t.samples === 1 ? '' : 's'}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
