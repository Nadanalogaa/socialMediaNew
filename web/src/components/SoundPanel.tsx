import { useEffect, useState } from 'react';
import type { ProjectAudio } from '@socialboost/shared';
import { loadAudioBuffer, previewSelection, selectionDuration, stopPreview } from '../lib/audio';
import { Button } from './ui';

/**
 * Sound for a reel.
 *
 * The track is decoded on selection so its real length is known, which is what
 * lets the start and end be chosen against the actual audio rather than a
 * guessed range.
 */
export function SoundPanel({
  audio,
  reelDuration,
  onChange,
  onPick,
}: {
  audio: ProjectAudio | undefined;
  reelDuration: number;
  onChange: (audio: ProjectAudio | undefined) => void;
  onPick: () => void;
}) {
  const [duration, setDuration] = useState<number | null>(audio?.durationSeconds ?? null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!audio?.url) {
      setDuration(null);
      return;
    }
    let cancelled = false;
    loadAudioBuffer(audio.url)
      .then((buffer) => {
        if (cancelled) return;
        setDuration(buffer.duration);
        setError(null);
        // Record the length so a reopened design knows its range without
        // downloading the file again.
        if (audio.durationSeconds !== buffer.duration) {
          onChange({ ...audio, durationSeconds: buffer.duration });
        }
      })
      .catch(() => !cancelled && setError('Could not read that audio file.'));
    return () => {
      cancelled = true;
    };
    // Only the URL should re-trigger a decode.
  }, [audio?.url]);

  useEffect(() => () => stopPreview(), []);

  if (!audio) {
    return (
      <>
        <p className="text-xs text-slate-500">
          Add your own music or a voiceover. Use audio you have the rights to — the platforms
          mute or remove posts using someone else's music.
        </p>
        <Button variant="secondary" className="mt-2 w-full !py-1 !text-xs" onClick={onPick}>
          Choose an audio file
        </Button>
      </>
    );
  }

  const total = duration ?? 0;
  const end = Math.min(audio.endSeconds ?? total, total);
  const clip = selectionDuration({ ...audio, endSeconds: end }, total || 1);

  function update(patch: Partial<ProjectAudio>) {
    onChange({ ...audio!, ...patch });
  }

  async function handlePreview() {
    if (playing) {
      stopPreview();
      setPlaying(false);
      return;
    }
    try {
      setPlaying(true);
      await previewSelection({ ...audio!, endSeconds: end });
      // Stops the button looking stuck once the clip has run.
      setTimeout(() => setPlaying(false), clip * 1000);
    } catch {
      setError('Could not play that audio.');
      setPlaying(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="truncate text-xs font-medium text-slate-800">{audio.name}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {duration === null ? (
        <p className="text-xs text-slate-500">Reading the file…</p>
      ) : (
        <>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">
              Starts at {audio.startSeconds.toFixed(1)}s
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(total - 0.5, 0.5)}
              step="0.1"
              value={audio.startSeconds}
              onChange={(e) => {
                const start = Number(e.target.value);
                update({ startSeconds: start, endSeconds: Math.max(end, start + 0.5) });
              }}
              className="w-full"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Ends at {end.toFixed(1)}s</span>
            <input
              type="range"
              min={audio.startSeconds + 0.5}
              max={total}
              step="0.1"
              value={end}
              onChange={(e) => update({ endSeconds: Number(e.target.value) })}
              className="w-full"
            />
          </label>

          <p className="text-xs text-slate-500">
            {clip.toFixed(1)}s selected of {total.toFixed(1)}s
            {clip > 0 && clip < reelDuration && ' · repeats to fill the reel'}
          </p>
        </>
      )}

      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">
          Volume {Math.round(audio.volume * 100)}%
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={audio.volume}
          onChange={(e) => update({ volume: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={audio.fadeOut}
          onChange={(e) => update({ fadeOut: e.target.checked })}
        />
        Fade out at the end
      </label>

      <div className="flex gap-1">
        <Button
          variant="secondary"
          className="flex-1 !px-2 !py-1 !text-xs"
          onClick={() => void handlePreview()}
        >
          {playing ? '■ Stop' : '▶ Hear it'}
        </Button>
        <Button variant="secondary" className="!px-2 !py-1 !text-xs" onClick={onPick}>
          Replace
        </Button>
        <button
          onClick={() => {
            stopPreview();
            onChange(undefined);
          }}
          className="rounded-lg border border-red-300 px-2 text-xs text-red-700 hover:bg-red-50"
        >
          ×
        </button>
      </div>
    </div>
  );
}
