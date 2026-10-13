import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASPECT_RATIOS,
  BUILT_IN_VIDEO_TEMPLATES,
  SCENE_TRANSITIONS,
  applyImageToAllScenes,
  projectPhotos,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  duplicateScene,
  newId,
  projectDuration,
  projectFromTemplate,
  reorder,
  type ProjectLayer,
  type ProjectScene,
  type ReelProject,
  type SceneTransition,
  type VideoTemplateDefinition,
} from '@socialboost/shared';
import { api, uploadAudio, uploadToCloudinary, type MediaAsset } from '../lib/api';
import {
  drawProjectFrame,
  preloadProjectImages,
  recordProject,
  type ImageCache,
} from '../lib/renderProject';
import { startPreviewLoop } from '../lib/audio';
import { LayerProperties } from '../components/LayerProperties';
import { SoundPanel } from '../components/SoundPanel';
import { Alert, Button, Card, Spinner } from '../components/ui';

export function ReelsScreen({
  onPublish,
  openDesignId,
}: {
  onPublish?: (asset: MediaAsset) => void;
  /** Set when arriving from My designs, to reopen a saved reel. */
  openDesignId?: string;
}) {
  const [project, setProject] = useState<ReelProject | null>(null);
  const [designId, setDesignId] = useState<string | undefined>(openDesignId);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!openDesignId) return;
    api
      .getDesign(openDesignId)
      .then((design) => {
        setProject(design.document as unknown as ReelProject);
        setDesignId(design.id);
      })
      .catch(() => setLoadError('Could not open that design.'));
  }, [openDesignId]);

  const canRecord =
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';

  if (!canRecord) {
    return (
      <Alert tone="warning">
        This browser cannot record video. Reels can be made in Chrome, Edge or Safari.
      </Alert>
    );
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!project) {
    return (
      <ReelPicker
        onPick={(next) => {
          setDesignId(undefined);
          setProject(next);
        }}
      />
    );
  }
  return (
    <ReelEditor
      key={designId ?? 'new'}
      project={project}
      setProject={setProject}
      onBack={() => setProject(null)}
      onPublish={onPublish}
      initialDesignId={designId}
    />
  );
}

function ReelPicker({ onPick }: { onPick: (project: ReelProject) => void }) {
  function start(template: VideoTemplateDefinition) {
    const values = Object.fromEntries(
      template.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue!]),
    );
    onPick(projectFromTemplate(template, values));
  }

  function blank() {
    onPick({
      name: 'Untitled reel',
      ratio: 'story',
      scenes: [
        {
          id: newId('scene'),
          name: 'Scene 1',
          durationSeconds: 3,
          transitionIn: 'cut',
          layers: [createShapeLayer('#0f172a'), createTextLayer('Your headline')],
        },
      ],
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Make a reel</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Start from a layout and change anything — move text, swap photos, add a logo, pick
          animations.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-4">
        {BUILT_IN_VIDEO_TEMPLATES.map((template) => (
          <li key={template.slug}>
            <button
              onClick={() => start(template)}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-400 hover:shadow"
            >
              <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-slate-900 text-xs text-slate-400">
                {template.scenes.length} scenes
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900">{template.name}</p>
            </button>
          </li>
        ))}
        <li>
          <button
            onClick={blank}
            className="h-full w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left transition hover:border-brand-400"
          >
            <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-slate-50 text-2xl text-slate-400">
              +
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">Blank reel</p>
          </button>
        </li>
      </ul>
    </div>
  );
}

function ReelEditor({
  project,
  setProject,
  onBack,
  onPublish,
  initialDesignId,
}: {
  project: ReelProject;
  setProject: (project: ReelProject) => void;
  onBack: () => void;
  onPublish?: (asset: MediaAsset) => void;
  initialDesignId?: string;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [images, setImages] = useState<ImageCache>(new Map());
  const [result, setResult] = useState<MediaAsset | null>(null);
  /** The photo highlighted in the library, which the Use buttons act on. */
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [designId, setDesignId] = useState<string | null>(initialDesignId ?? null);
  const [shortDescription, setShortDescription] = useState('');
  const [tagText, setTagText] = useState('');
  const audioInput = useRef<HTMLInputElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ layerId: string; startX: number; startY: number; boxX: number; boxY: number } | null>(null);

  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)]!;
  const photos = useMemo(() => projectPhotos(project), [project]);
  const selectedLayer = scene.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const { w: canvasW, h: canvasH } = ASPECT_RATIOS[project.ratio];

  // Images are decoded once per change rather than per frame.
  useEffect(() => {
    let cancelled = false;
    void preloadProjectImages(project).then((cache) => !cancelled && setImages(cache));
    return () => {
      cancelled = true;
    };
  }, [project]);

  /**
   * Sound follows Play all.
   *
   * Keyed on the audio settings so changing the trim or volume restarts it,
   * rather than carrying on with the previous selection.
   */
  useEffect(() => {
    if (!playing || !project.audio?.url) return;

    let stop: (() => void) | null = null;
    let cancelled = false;

    void startPreviewLoop(project.audio, projectDuration(project))
      .then((stopFn) => {
        if (cancelled) stopFn();
        else stop = stopFn;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [
    playing,
    project.audio?.url,
    project.audio?.startSeconds,
    project.audio?.endSeconds,
    project.audio?.volume,
  ]);

  // Paused shows the selected scene; playing runs the whole reel.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frameId = 0;
    const startedAt = performance.now();
    const total = projectDuration(project);

    const loop = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      if (playing) {
        drawProjectFrame(ctx, project, images, elapsed % total, canvasW, canvasH);
      } else {
        // Past the entrance window so layers are shown settled, not mid-animation.
        drawProjectFrame(ctx, project, images, 0, canvasW, canvasH, {
          scene,
          sceneElapsed: Math.min(scene.durationSeconds, 1.2),
        });
      }
      frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [project, scene, playing, images, canvasW, canvasH]);

  const updateScene = useCallback(
    (patch: Partial<ProjectScene>) => {
      setProject({
        ...project,
        scenes: project.scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)),
      });
    },
    [project, scene.id, setProject],
  );

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<ProjectLayer>) => {
      updateScene({
        layers: scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer,
        ),
      });
    },
    [scene.layers, updateScene],
  );

  function openFilePicker(intent: 'layer' | 'logo' | 'library') {
    fileInput.current?.setAttribute('data-apply', intent);
    fileInput.current?.click();
  }

  /**
   * Puts an existing photo on the current scene.
   *
   * Prefers a selected image layer, then the scene's background photo, and
   * only adds a new layer when the scene has no photo at all.
   */
  function usePhotoHere(url: string) {
    const target =
      (selectedLayer?.type === 'image' ? selectedLayer : null) ??
      scene.layers.find((layer) => layer.type === 'image' && layer.box.w >= 80);

    if (target) updateLayer(target.id, { content: url });
    else addLayer(createImageLayer(url));
    setActivePhoto(url);
  }

  function applyEverywhere(url: string) {
    setProject(applyImageToAllScenes(project, url));
    setActivePhoto(url);
    setNotice('Photo applied to every scene.');
  }

  function addLayer(layer: ProjectLayer) {
    updateScene({ layers: [...scene.layers, layer] });
    setSelectedLayerId(layer.id);
  }

  function removeLayer(layerId: string) {
    updateScene({ layers: scene.layers.filter((layer) => layer.id !== layerId) });
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  }

  function addScene() {
    const scenes = [
      ...project.scenes,
      {
        id: newId('scene'),
        name: `Scene ${project.scenes.length + 1}`,
        durationSeconds: 3,
        transitionIn: 'fade' as SceneTransition,
        layers: [createShapeLayer('#0f172a'), createTextLayer('Your text')],
      },
    ];
    setProject({ ...project, scenes });
    setSceneIndex(scenes.length - 1);
  }

  /** Canvas coordinates as a percentage, which is how boxes are stored. */
  function pointerPercent(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = pointerPercent(event);
    // Topmost layer wins, matching what the user sees.
    const hit = [...scene.layers]
      .reverse()
      .find(
        (layer) =>
          !layer.hidden &&
          point.x >= layer.box.x &&
          point.x <= layer.box.x + layer.box.w &&
          point.y >= layer.box.y &&
          point.y <= layer.box.y + layer.box.h,
      );

    if (!hit) {
      setSelectedLayerId(null);
      return;
    }
    setSelectedLayerId(hit.id);
    dragState.current = {
      layerId: hit.id,
      startX: point.x,
      startY: point.y,
      boxX: hit.box.x,
      boxY: hit.box.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const point = pointerPercent(event);
    const layer = scene.layers.find((l) => l.id === drag.layerId);
    if (!layer) return;

    updateLayer(drag.layerId, {
      box: {
        ...layer.box,
        // Clamped so a layer cannot be dragged entirely off the canvas.
        x: Math.max(-layer.box.w + 5, Math.min(95, drag.boxX + (point.x - drag.startX))),
        y: Math.max(-layer.box.h + 5, Math.min(95, drag.boxY + (point.y - drag.startY))),
      },
    });
  }

  async function uploadPhoto(file: File, intent: 'layer' | 'logo' | 'library') {
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);

      if (intent === 'logo') {
        addLayer(createImageLayer(uploaded.url, true));
        return;
      }

      setActivePhoto(uploaded.url);

      if (intent === 'layer') {
        usePhotoHere(uploaded.url);
        return;
      }

      // Uploaded to the library: land it on this scene so it is visible,
      // leaving "every scene" as a deliberate second step.
      usePhotoHere(uploaded.url);
      setNotice('Photo added. Use "Use on every scene" to apply it to all of them.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    }
  }

  async function handleSave(renderedAssetId?: string) {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveDesign({
        id: designId ?? undefined,
        name: project.name || 'Untitled reel',
        kind: 'video',
        ratio: project.ratio,
        document: project as unknown as Record<string, unknown>,
        shortDescription: shortDescription || undefined,
        tags: tagText
          .split(/[,\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        renderedAssetId,
      });
      setDesignId(saved.id);
      setNotice('Saved. Find it again under My designs.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this reel.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAudio(file: File) {
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadAudio(file, signature);
      setProject({
        ...project,
        audio: {
          url: uploaded.url,
          name: file.name,
          volume: 0.8,
          startSeconds: 0,
          fadeOut: true,
        },
      });
      setNotice('Sound added. Trim it, press "Hear it" to check, then create the reel.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that sound.');
    }
  }

  async function handleCreate() {
    setRecording(true);
    setPlaying(false);
    setError(null);
    setNotice(null);
    try {
      const video = await recordProject(project, setProgress);
      const extension = video.mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([video.blob], `reel.${extension}`, { type: video.mimeType });
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      const asset = await api.registerMedia({
        kind: 'video',
        url: uploaded.url,
        bytes: video.blob.size,
        durationSeconds: Math.round(video.durationSeconds),
        providerRef: uploaded.publicId,
      });
      setResult(asset);
      setNotice(null);
      // Keeps the library thumbnail in step with the latest render.
      void handleSave(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the reel.');
    } finally {
      setRecording(false);
    }
  }

  const duration = projectDuration(project);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← Templates
        </Button>
        <input
          value={project.name}
          onChange={(e) => setProject({ ...project, name: e.target.value })}
          className="rounded-lg border border-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
        />
        <span className="text-sm text-slate-500">{duration.toFixed(1)}s</span>
        <Button variant="secondary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : designId ? 'Save' : 'Save to my designs'}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          placeholder="Short description — shown on the library card"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <input
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="Tags, separated by spaces — diwali offer chennai"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        {/* Scenes */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">Scenes</h3>
              <button onClick={addScene} className="text-xs text-brand-600 hover:underline">
                + Add
              </button>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {project.scenes.map((s, index) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setSceneIndex(index);
                      setSelectedLayerId(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                      index === sceneIndex
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.durationSeconds}s</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Length {scene.durationSeconds.toFixed(1)}s
                </span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={scene.durationSeconds}
                  onChange={(e) => updateScene({ durationSeconds: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Entrance</span>
                <select
                  value={scene.transitionIn}
                  onChange={(e) =>
                    updateScene({ transitionIn: e.target.value as SceneTransition })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {SCENE_TRANSITIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const copy = duplicateScene(scene);
                    setProject({
                      ...project,
                      scenes: [
                        ...project.scenes.slice(0, sceneIndex + 1),
                        copy,
                        ...project.scenes.slice(sceneIndex + 1),
                      ],
                    });
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Duplicate
                </button>
                <button
                  disabled={project.scenes.length <= 1}
                  onClick={() => {
                    setProject({
                      ...project,
                      scenes: project.scenes.filter((s) => s.id !== scene.id),
                    });
                    setSceneIndex(Math.max(0, sceneIndex - 1));
                  }}
                  className="flex-1 rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          </Card>

        </div>

        {/* Preview — the centrepiece, sized to the viewport */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full flex-col items-center rounded-xl border border-slate-200 bg-slate-900 p-4">
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => (dragState.current = null)}
              style={{ aspectRatio: '9 / 16' }}
              className="h-[min(68vh,760px)] w-auto max-w-full cursor-move touch-none rounded-lg bg-black shadow-2xl"
              aria-label="Reel preview"
            />

            <div className="mt-3 flex w-full items-center justify-center gap-2">
              <Button variant="secondary" onClick={() => setPlaying((v) => !v)}>
                {playing ? '⏸ Pause' : '▶ Play all'}
              </Button>
              <Button onClick={() => void handleCreate()} disabled={recording}>
                {recording ? 'Recording…' : '● Create reel'}
              </Button>
            </div>

            {recording ? (
              <div className="mt-3 w-full max-w-sm">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-slate-300">
                  Recording in real time… {Math.round(progress * 100)}%
                </p>
              </div>
            ) : (
              <p className="mt-2 text-center text-xs text-slate-400">
                Click a layer to select it · drag to move it
              </p>
            )}
          </div>

          {result && (
            <div className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              {/* Small enough to stay out of the way; the preview above is the
                  thing worth looking at. */}
              <button
                onClick={() => setPreviewOpen(true)}
                title="Preview"
                className="relative h-20 w-[45px] shrink-0 overflow-hidden rounded-md bg-black"
              >
                <video src={result.url} muted playsInline className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center text-white">
                  ▶
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-emerald-900">Reel ready</p>
                <p className="text-xs text-emerald-800">
                  {duration.toFixed(1)}s · saved to your library
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                  Preview
                </Button>
                <a
                  href={result.url}
                  download={`${project.name || 'reel'}.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Export
                </a>
                <Button onClick={() => onPublish?.(result)}>Publish</Button>
              </div>
            </div>
          )}
        </div>

        {/* Layers, photos and the selected layer's properties */}
        <div className="space-y-3">
          <Card className="p-3">
            <h3 className="mb-2 text-sm font-medium text-slate-900">Layers</h3>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {[...scene.layers].reverse().map((layer) => {
                const index = scene.layers.indexOf(layer);
                return (
                  <li key={layer.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedLayerId(layer.id)}
                      className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        layer.id === selectedLayerId
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {layer.type === 'text' ? '¶' : layer.type === 'image' ? '▣' : '■'}{' '}
                      {layer.name}
                    </button>
                    <button
                      title="Move up"
                      onClick={() =>
                        updateScene({ layers: reorder(scene.layers, index, index + 1) })
                      }
                      className="px-1 text-xs text-slate-400 hover:text-slate-700"
                    >
                      ↑
                    </button>
                    <button
                      title={layer.hidden ? 'Show' : 'Hide'}
                      onClick={() => updateLayer(layer.id, { hidden: !layer.hidden })}
                      className="px-1 text-xs text-slate-400 hover:text-slate-700"
                    >
                      {layer.hidden ? '○' : '●'}
                    </button>
                    <button
                      title="Delete"
                      onClick={() => removeLayer(layer.id)}
                      className="px-1 text-xs text-slate-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 grid grid-cols-2 gap-1 border-t border-slate-100 pt-2">
              <button
                onClick={() => addLayer(createTextLayer())}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                + Text
              </button>
              <button
                onClick={() => openFilePicker('layer')}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                + Photo
              </button>
              <button
                onClick={() => openFilePicker('logo')}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                + Logo
              </button>
              <button
                onClick={() => addLayer(createShapeLayer('#4f46e5'))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                + Colour
              </button>
            </div>
          </Card>

          <Card className="p-3">
            <h3 className="mb-2 text-sm font-medium text-slate-900">Sound</h3>
            <SoundPanel
              audio={project.audio}
              reelDuration={duration}
              onChange={(audio) => setProject({ ...project, audio })}
              onPick={() => audioInput.current?.click()}
            />
          </Card>

          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">Photos</h3>
              <button
                onClick={() => openFilePicker('library')}
                className="text-xs text-brand-600 hover:underline"
              >
                + Upload
              </button>
            </div>

            {photos.length === 0 ? (
              <p className="text-xs text-slate-500">
                Upload a photo once and reuse it on any scene without uploading again.
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-4 gap-1.5">
                  {photos.map((url) => (
                    <li key={url}>
                      <button
                        onClick={() => setActivePhoto(url)}
                        onDoubleClick={() => usePhotoHere(url)}
                        title="Click to select, double-click to use on this scene"
                        className={`block w-full overflow-hidden rounded-lg border-2 transition ${
                          activePhoto === url
                            ? 'border-brand-500'
                            : 'border-transparent hover:border-slate-300'
                        }`}
                      >
                        <img src={url} alt="" className="aspect-square w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 space-y-1">
                  <button
                    onClick={() => activePhoto && usePhotoHere(activePhoto)}
                    disabled={!activePhoto}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                  >
                    Use on this scene
                  </button>
                  <button
                    onClick={() => activePhoto && applyEverywhere(activePhoto)}
                    disabled={!activePhoto}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                  >
                    Use on every scene
                  </button>
                </div>
              </>
            )}
          </Card>

        <Card className="p-3">
          <h3 className="mb-2 text-sm font-medium text-slate-900">
            {selectedLayer ? selectedLayer.name : 'Nothing selected'}
          </h3>
          {selectedLayer ? (
            <div className="max-h-[52vh] overflow-y-auto pr-1">
            <LayerProperties
              layer={selectedLayer}
              onChange={(patch) => updateLayer(selectedLayer.id, patch)}
              onPickImage={() => openFilePicker('layer')}
            />
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Click something on the preview, or pick a layer, to edit it. Drag on the preview to
              move it.
            </p>
          )}
        </Card>
        </div>
      </div>

      {previewOpen && result && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reel preview"
          onClick={() => setPreviewOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full flex-col items-center gap-3"
          >
            <video
              src={result.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[78vh] rounded-xl bg-black shadow-2xl"
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <a
                href={result.url}
                download={`${project.name || 'reel'}.mp4`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Export MP4
              </a>
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  onPublish?.(result);
                }}
              >
                Publish
              </Button>
              <button
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleAudio(file);
          e.target.value = '';
        }}
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const intent = (fileInput.current?.getAttribute('data-apply') ?? 'layer') as
            | 'layer'
            | 'logo'
            | 'library';
          const file = e.target.files?.[0];
          if (file) void uploadPhoto(file, intent);
          e.target.value = '';
        }}
      />
    </div>
  );
}
