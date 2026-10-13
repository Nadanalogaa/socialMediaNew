import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASPECT_RATIOS,
  BUILT_IN_VIDEO_TEMPLATES,
  SCENE_TRANSITIONS,
  applyImageToAllScenes,
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
import { api, uploadToCloudinary } from '../lib/api';
import {
  drawProjectFrame,
  preloadProjectImages,
  recordProject,
  type ImageCache,
} from '../lib/renderProject';
import { LayerProperties } from '../components/LayerProperties';
import { Alert, Button, Card, Spinner } from '../components/ui';

export function ReelsScreen() {
  const [project, setProject] = useState<ReelProject | null>(null);

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

  if (!project) return <ReelPicker onPick={setProject} />;
  return <ReelEditor project={project} setProject={setProject} onBack={() => setProject(null)} />;
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
}: {
  project: ReelProject;
  setProject: (project: ReelProject) => void;
  onBack: () => void;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [images, setImages] = useState<ImageCache>(new Map());
  const [result, setResult] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ layerId: string; startX: number; startY: number; boxX: number; boxY: number } | null>(null);

  const scene = project.scenes[Math.min(sceneIndex, project.scenes.length - 1)]!;
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

  async function uploadPhoto(file: File, apply: 'layer' | 'all') {
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      if (apply === 'all') {
        setProject(applyImageToAllScenes(project, uploaded.url));
        setNotice('Photo applied to every scene.');
      } else if (selectedLayer?.type === 'image') {
        updateLayer(selectedLayer.id, { content: uploaded.url });
      } else {
        addLayer(createImageLayer(uploaded.url));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
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
      setResult(asset.url);
      setNotice('Reel saved to your library. Pick it in Compose to publish.');
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
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[260px_300px_1fr]">
        {/* Scenes and layers */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">Scenes</h3>
              <button onClick={addScene} className="text-xs text-brand-600 hover:underline">
                + Add
              </button>
            </div>
            <ul className="space-y-1">
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

          <Card className="p-3">
            <h3 className="mb-2 text-sm font-medium text-slate-900">Layers</h3>
            <ul className="space-y-1">
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
                onClick={() => {
                  fileInput.current?.setAttribute('data-apply', 'layer');
                  fileInput.current?.click();
                }}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                + Photo
              </button>
              <button
                onClick={() => {
                  fileInput.current?.setAttribute('data-apply', 'logo');
                  fileInput.current?.click();
                }}
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
              <button
                onClick={() => {
                  fileInput.current?.setAttribute('data-apply', 'all');
                  fileInput.current?.click();
                }}
                className="col-span-2 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                Same photo on every scene
              </button>
            </div>
          </Card>
        </div>

        {/* Properties */}
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-medium text-slate-900">
            {selectedLayer ? selectedLayer.name : 'Nothing selected'}
          </h3>
          {selectedLayer ? (
            <LayerProperties
              layer={selectedLayer}
              onChange={(patch) => updateLayer(selectedLayer.id, patch)}
              onPickImage={() => {
                fileInput.current?.setAttribute('data-apply', 'layer');
                fileInput.current?.click();
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Click something on the preview, or pick a layer, to edit it. Drag on the preview to
              move it.
            </p>
          )}
        </Card>

        {/* Preview */}
        <div className="space-y-2">
          <Card className="p-3">
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => (dragState.current = null)}
              className="w-full max-w-[280px] cursor-move touch-none rounded-lg bg-black"
              aria-label="Reel preview"
            />
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={() => setPlaying((v) => !v)}>
                {playing ? '⏸ Pause' : '▶ Play all'}
              </Button>
            </div>
            {recording && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Recording… {Math.round(progress * 100)}%
                </p>
              </div>
            )}
          </Card>

          <Button onClick={() => void handleCreate()} disabled={recording}>
            {recording ? 'Recording…' : 'Create reel'}
          </Button>

          {result && (
            <Card className="p-2">
              <video src={result} controls playsInline className="w-full rounded-lg" />
            </Card>
          )}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const apply = fileInput.current?.getAttribute('data-apply');
          const file = e.target.files?.[0];
          if (!file) return;
          if (apply === 'all') void uploadPhoto(file, 'all');
          else if (apply === 'logo') {
            void (async () => {
              const signature = await api.uploadSignature();
              const uploaded = await uploadToCloudinary(file, signature);
              addLayer(createImageLayer(uploaded.url, true));
            })();
          } else void uploadPhoto(file, 'layer');
          e.target.value = '';
        }}
      />
    </div>
  );
}
