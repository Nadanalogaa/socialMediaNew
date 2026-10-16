import { useEffect, useRef } from 'react';
import type { ProjectScene, ReelProject } from '@socialboost/shared';
import { drawProjectFrame, type ImageCache } from '../lib/renderProject';

/**
 * The scenes of a reel, as pictures.
 *
 * A reel is a sequence, and a numbered list does not say that. Showing each
 * scene as a thumbnail makes the structure obvious without explaining it,
 * which matters most for someone who has never used an editor.
 */
export function SceneFilmstrip({
  project,
  images,
  activeIndex,
  onSelect,
  onAdd,
}: {
  project: ReelProject;
  images: ImageCache;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
      {project.scenes.map((scene, index) => (
        <button
          key={scene.id}
          onClick={() => onSelect(index)}
          aria-current={index === activeIndex ? 'true' : undefined}
          className={`group flex shrink-0 flex-col items-center gap-1 rounded-lg p-1 transition ${
            index === activeIndex ? 'bg-brand-50 ring-2 ring-brand-500' : 'hover:bg-slate-100'
          }`}
        >
          <SceneThumbnail project={project} scene={scene} images={images} />
          <span
            className={`text-[11px] ${
              index === activeIndex ? 'font-medium text-brand-700' : 'text-slate-500'
            }`}
          >
            {index + 1} · {scene.durationSeconds.toFixed(1)}s
          </span>
        </button>
      ))}

      <button
        onClick={onAdd}
        className="flex h-[76px] w-[44px] shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition hover:border-brand-400 hover:text-brand-600"
        title="Add a scene"
      >
        <span className="text-lg leading-none">+</span>
        <span className="text-[10px]">Scene</span>
      </button>
    </div>
  );
}

function SceneThumbnail({
  project,
  scene,
  images,
}: {
  project: ReelProject;
  scene: ProjectScene;
  images: ImageCache;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Drawn small but through the same renderer, so a thumbnail is never a
    // stale or approximate version of the scene.
    ctx.save();
    ctx.scale(canvas.width / 1080, canvas.height / 1920);
    drawProjectFrame(ctx, project, images, 0, 1080, 1920, {
      scene,
      // Past the entrance so layers are shown settled, not mid-animation.
      sceneElapsed: Math.min(scene.durationSeconds, 1.2),
    });
    ctx.restore();
  }, [project, scene, images]);

  return (
    <canvas
      ref={canvasRef}
      width={54}
      height={96}
      className="rounded bg-black"
      aria-hidden
    />
  );
}
