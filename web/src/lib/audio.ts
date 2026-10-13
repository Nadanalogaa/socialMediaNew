/**
 * Audio decoding and playback for reels.
 *
 * The file is fetched and decoded rather than played through an <audio>
 * element: `createMediaElementSource` on a cross-origin file yields silence
 * whenever CORS does not line up, which is both easy to hit and invisible —
 * the recording simply comes out silent. Decoding the bytes ourselves also
 * gives sample-accurate trimming, which an element cannot.
 */

const cache = new Map<string, AudioBuffer>();
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext {
  sharedContext ??= new AudioContext();
  return sharedContext;
}

export async function loadAudioBuffer(url: string): Promise<AudioBuffer> {
  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error('Could not download that audio file.');

  const bytes = await response.arrayBuffer();
  const buffer = await getContext().decodeAudioData(bytes);
  cache.set(url, buffer);
  return buffer;
}

export interface AudioSelection {
  url: string;
  volume: number;
  startSeconds: number;
  endSeconds?: number;
  fadeOut: boolean;
}

/** How long the selected part of the track lasts. */
export function selectionDuration(selection: AudioSelection, bufferDuration: number): number {
  const end = Math.min(selection.endSeconds ?? bufferDuration, bufferDuration);
  return Math.max(0, end - selection.startSeconds);
}

export interface PreparedAudio {
  tracks: MediaStreamTrack[];
  start: () => void;
  stop: () => void;
}

/**
 * Builds an audio track for the recorder.
 *
 * The clip loops if it is shorter than the reel, so a short piece of music
 * still covers the whole video rather than leaving it silent halfway through.
 */
export async function prepareAudioForRecording(
  selection: AudioSelection,
  reelDuration: number,
): Promise<PreparedAudio> {
  const buffer = await loadAudioBuffer(selection.url);
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const gain = context.createGain();
  gain.gain.value = selection.volume;
  gain.connect(destination);

  const clipLength = selectionDuration(selection, buffer.duration);
  const sources: AudioBufferSourceNode[] = [];

  return {
    tracks: destination.stream.getAudioTracks(),
    start: () => {
      void context.resume();
      const now = context.currentTime + 0.05;

      if (clipLength <= 0.05) return;

      // Repeat the clip until the reel is covered.
      for (let offset = 0; offset < reelDuration; offset += clipLength) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        const remaining = Math.min(clipLength, reelDuration - offset);
        source.start(now + offset, selection.startSeconds, remaining);
        sources.push(source);
      }

      if (selection.fadeOut) {
        gain.gain.setValueAtTime(selection.volume, now + Math.max(reelDuration - 1, 0));
        gain.gain.linearRampToValueAtTime(0.0001, now + reelDuration);
      }
    },
    stop: () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* Already finished. */
        }
      }
      void context.close();
    },
  };
}

let previewSource: AudioBufferSourceNode | null = null;

/** Plays the selected part once, so the choice can be heard before recording. */
export async function previewSelection(selection: AudioSelection): Promise<void> {
  stopPreview();
  const buffer = await loadAudioBuffer(selection.url);
  const context = getContext();
  await context.resume();

  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = selection.volume;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(context.destination);

  source.start(
    0,
    selection.startSeconds,
    selectionDuration(selection, buffer.duration) || undefined,
  );
  previewSource = source;
}

export function stopPreview(): void {
  if (!previewSource) return;
  try {
    previewSource.stop();
  } catch {
    /* Already finished. */
  }
  previewSource = null;
}
