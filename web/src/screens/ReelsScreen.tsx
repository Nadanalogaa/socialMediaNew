import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ASPECT_RATIOS,
  BUILT_IN_VIDEO_TEMPLATES,
  videoDurationSeconds,
  type TemplateField,
  type VideoSpec,
  type VideoTemplateDefinition,
} from '@socialboost/shared';
import { api, uploadToCloudinary } from '../lib/api';
import {
  canRecordVideo,
  drawFrame,
  recordVideo,
  renderPosterFrame,
} from '../lib/renderVideo';
import { Alert, Button, Card, Spinner } from '../components/ui';

/**
 * Reel maker.
 *
 * Scenes are animated on a canvas and captured with the browser's own
 * recorder, so making a video costs nothing and needs no server. Cloudinary
 * converts the recording to the MP4 the platforms require.
 */
export function ReelsScreen() {
  const [template, setTemplate] = useState<VideoTemplateDefinition | null>(null);

  if (!canRecordVideo()) {
    return (
      <Alert tone="warning">
        This browser cannot record video. Reels can be made in Chrome, Edge or Safari.
      </Alert>
    );
  }

  if (!template) return <ReelPicker onPick={setTemplate} />;
  return <ReelEditor template={template} onBack={() => setTemplate(null)} />;
}

function ReelPicker({ onPick }: { onPick: (t: VideoTemplateDefinition) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Make a reel</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Add a few photos and a few words. You get a vertical video ready for Instagram Reels,
          Facebook and Stories.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {BUILT_IN_VIDEO_TEMPLATES.map((template) => (
          <li key={template.slug}>
            <button
              onClick={() => onPick(template)}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-400 hover:shadow"
            >
              <ReelThumbnail template={template} />
              <p className="mt-2 font-medium text-slate-900">{template.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {videoDurationSeconds(template).toFixed(0)}s · {template.scenes.length} scenes
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReelThumbnail({ template }: { template: VideoTemplateDefinition }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderPosterFrame({ template, values: {}, ratio: 'story' }, 1.2)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [template]);

  return (
    <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded-lg bg-slate-100">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Spinner className="h-5 w-5 text-slate-400" />
      )}
    </div>
  );
}

function ReelEditor({
  template,
  onBack,
}: {
  template: VideoTemplateDefinition;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      template.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue!]),
    ),
  );
  const [playing, setPlaying] = useState(true);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const spec: VideoSpec = useMemo(
    () => ({ template, values, ratio: 'story' }),
    [template, values],
  );
  const duration = videoDurationSeconds(template);
  const missing = template.fields.filter((f) => f.required && !values[f.key]);

  // Loop the preview so edits are seen in motion, not as a still.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;
    let cancelled = false;
    const startedAt = performance.now();

    // Preview uses whatever images are already decoded; the recorder
    // preloads properly before capturing.
    const images = new Map<string, HTMLImageElement>();
    const urls = new Set<string>();
    for (const scene of template.scenes) {
      for (const layer of scene.layers) {
        if (layer.type === 'image' && layer.bind && values[layer.bind]) {
          urls.add(values[layer.bind]!);
        }
      }
    }

    Promise.all(
      [...urls].map(
        (url) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => {
              images.set(url, image);
              resolve();
            };
            image.onerror = () => resolve();
            image.src = url;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      const loop = () => {
        const elapsed = ((performance.now() - startedAt) / 1000) % duration;
        drawFrame(ctx, spec, images, elapsed, canvas.width, canvas.height);
        frameId = requestAnimationFrame(loop);
      };
      loop();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [spec, playing, duration, template, values]);

  async function handleImageField(key: string, file: File) {
    setUploadingField(key);
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      setValues((prev) => ({ ...prev, [key]: uploaded.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setUploadingField(null);
    }
  }

  /**
   * Records, uploads, and registers the reel.
   *
   * Cloudinary is told to treat it as video, so it transcodes whatever the
   * browser produced into the MP4 that Instagram accepts.
   */
  async function handleCreate() {
    setRecording(true);
    setPlaying(false);
    setError(null);
    setNotice(null);
    setProgress(0);
    try {
      const video = await recordVideo(spec, setProgress);
      const extension = video.mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([video.blob], `${template.slug}.${extension}`, {
        type: video.mimeType,
      });

      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);

      const asset = await api.registerMedia({
        kind: 'video',
        url: uploaded.url,
        bytes: video.blob.size,
        durationSeconds: Math.round(video.durationSeconds),
        providerRef: uploaded.publicId,
      });

      setResult({ url: asset.url, mimeType: video.mimeType });
      setNotice('Reel saved to your library. Pick it in Compose to publish.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the reel.');
    } finally {
      setRecording(false);
      setPlaying(true);
    }
  }

  const { w, h } = ASPECT_RATIOS.story;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← Templates
        </Button>
        <h2 className="text-lg font-semibold text-slate-900">{template.name}</h2>
        <span className="text-sm text-slate-500">{duration.toFixed(0)}s</span>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card>
          <div className="space-y-3">
            {template.fields.map((field) => (
              <ReelField
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                uploading={uploadingField === field.key}
                onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
                onPickFile={() => {
                  fileInput.current?.setAttribute('data-field', field.key);
                  fileInput.current?.click();
                }}
              />
            ))}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const key = fileInput.current?.getAttribute('data-field');
              const file = e.target.files?.[0];
              if (key && file) void handleImageField(key, file);
              e.target.value = '';
            }}
          />
        </Card>

        <div className="space-y-3">
          <Card className="p-3">
            <canvas
              ref={canvasRef}
              width={w}
              height={h}
              className="w-full rounded-lg bg-black"
              aria-label="Preview of your reel"
            />
            {recording && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Recording in real time… {Math.round(progress * 100)}%
                </p>
              </div>
            )}
          </Card>

          {missing.length > 0 && (
            <Alert tone="warning">Still needed: {missing.map((f) => f.label).join(', ')}</Alert>
          )}

          <Button onClick={() => void handleCreate()} disabled={recording || missing.length > 0}>
            {recording ? 'Recording…' : 'Create reel'}
          </Button>

          {result && (
            <Card className="p-3">
              <video src={result.url} controls playsInline className="w-full rounded-lg" />
              <a
                href={result.url}
                download
                className="mt-2 block text-center text-sm text-brand-600 hover:underline"
              >
                Download
              </a>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ReelField({
  field,
  value,
  uploading,
  onChange,
  onPickFile,
}: {
  field: TemplateField;
  value: string;
  uploading: boolean;
  onChange: (value: string) => void;
  onPickFile: () => void;
}) {
  const header = (
    <span className="mb-1 flex items-baseline justify-between">
      <span className="text-sm font-medium text-slate-700">
        {field.label}
        {!field.required && <span className="ml-1 text-xs text-slate-400">optional</span>}
      </span>
      {field.maxLength && (
        <span className="text-xs text-slate-400">
          {value.length}/{field.maxLength}
        </span>
      )}
    </span>
  );

  if (field.type === 'image') {
    return (
      <label className="block">
        {header}
        <div className="flex items-center gap-2">
          {value && <img src={value} alt="" className="h-10 w-10 rounded object-cover" />}
          <Button variant="secondary" onClick={onPickFile} disabled={uploading}>
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Choose photo'}
          </Button>
        </div>
      </label>
    );
  }

  if (field.type === 'color') {
    return (
      <label className="block">
        {header}
        <input
          type="color"
          value={value || field.defaultValue || '#4f46e5'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-16 cursor-pointer rounded border border-slate-300"
        />
      </label>
    );
  }

  return (
    <label className="block">
      {header}
      <input
        value={value}
        maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}
