import { LAYER_ANIMATIONS, type ProjectLayer } from '@socialboost/shared';
import { FONT_CHOICES } from '../lib/renderProject';

/**
 * Properties of the selected layer.
 *
 * Controls are grouped by what the user is thinking about — the words, how they
 * look, how they move — rather than by the shape of the underlying style object.
 */
export function LayerProperties({
  layer,
  onChange,
  onPickImage,
}: {
  layer: ProjectLayer;
  onChange: (patch: Partial<ProjectLayer>) => void;
  onPickImage: () => void;
}) {
  const style = layer.style;
  const setStyle = (patch: Partial<ProjectLayer['style']>) =>
    onChange({ style: { ...style, ...patch } });

  return (
    <div className="space-y-3 text-sm">
      {layer.type === 'text' && (
        <>
          <Field label="Text">
            <textarea
              value={layer.content}
              rows={2}
              onChange={(e) => onChange({ content: e.target.value, name: e.target.value.slice(0, 24) })}
              className={inputClass}
            />
          </Field>

          <Field label="Font">
            <select
              value={style.fontFamily ?? FONT_CHOICES[0]!.value}
              onChange={(e) => setStyle({ fontFamily: e.target.value })}
              className={inputClass}
            >
              {FONT_CHOICES.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={`Size ${(style.fontSizePct ?? 5).toFixed(1)}`}>
              <input
                type="range"
                min="1.5"
                max="18"
                step="0.1"
                value={style.fontSizePct ?? 5}
                onChange={(e) => setStyle({ fontSizePct: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
            <Field label="Weight">
              <select
                value={style.fontWeight ?? 400}
                onChange={(e) => setStyle({ fontWeight: Number(e.target.value) })}
                className={inputClass}
              >
                <option value={300}>Light</option>
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={800}>Bold</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Colour">
              <input
                type="color"
                value={style.color ?? '#ffffff'}
                onChange={(e) => setStyle({ color: e.target.value, gradient: undefined })}
                className="h-8 w-full cursor-pointer rounded border border-slate-300"
              />
            </Field>
            <Field label="Align">
              <select
                value={style.align ?? 'left'}
                onChange={(e) => setStyle({ align: e.target.value as 'left' | 'center' | 'right' })}
                className={inputClass}
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </Field>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-2">
            <legend className="px-1 text-xs font-medium text-slate-600">Effects</legend>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(style.shadow)}
                onChange={(e) =>
                  setStyle({
                    shadow: e.target.checked
                      ? { color: 'rgba(0,0,0,0.5)', blur: 20, offsetY: 2 }
                      : undefined,
                  })
                }
              />
              Drop shadow
              <span className="text-slate-400">lifts text off a photo</span>
            </label>

            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(style.stroke)}
                onChange={(e) =>
                  setStyle({
                    stroke: e.target.checked ? { color: '#000000', widthPct: 4 } : undefined,
                  })
                }
              />
              Outline
            </label>
            {style.stroke && (
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="color"
                  value={style.stroke.color}
                  onChange={(e) =>
                    setStyle({ stroke: { ...style.stroke!, color: e.target.value } })
                  }
                  className="h-7 w-10 cursor-pointer rounded border border-slate-300"
                />
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={style.stroke.widthPct}
                  onChange={(e) =>
                    setStyle({ stroke: { ...style.stroke!, widthPct: Number(e.target.value) } })
                  }
                  className="flex-1"
                />
              </div>
            )}

            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(style.gradient)}
                onChange={(e) =>
                  setStyle({ gradient: e.target.checked ? ['#ffffff', '#93c5fd'] : undefined })
                }
              />
              Gradient fill
            </label>
            {style.gradient && (
              <div className="mt-1.5 flex gap-2">
                <input
                  type="color"
                  value={style.gradient[0]}
                  onChange={(e) => setStyle({ gradient: [e.target.value, style.gradient![1]] })}
                  className="h-7 w-full cursor-pointer rounded border border-slate-300"
                />
                <input
                  type="color"
                  value={style.gradient[1]}
                  onChange={(e) => setStyle({ gradient: [style.gradient![0], e.target.value] })}
                  className="h-7 w-full cursor-pointer rounded border border-slate-300"
                />
              </div>
            )}

            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={style.textTransform === 'uppercase'}
                onChange={(e) =>
                  setStyle({ textTransform: e.target.checked ? 'uppercase' : 'none' })
                }
              />
              Uppercase
            </label>
          </fieldset>
        </>
      )}

      {layer.type === 'image' && (
        <>
          <Field label="Photo">
            <button
              onClick={onPickImage}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {layer.content ? 'Replace photo' : 'Choose photo'}
            </button>
          </Field>
          <Field label="Fill">
            <select
              value={style.fit ?? 'cover'}
              onChange={(e) => setStyle({ fit: e.target.value as 'cover' | 'contain' })}
              className={inputClass}
            >
              <option value="cover">Fill the box (crop)</option>
              <option value="contain">Fit inside (no crop)</option>
            </select>
          </Field>
          <Field label="Darken behind text">
            <select
              value={style.overlay ?? ''}
              onChange={(e) => setStyle({ overlay: e.target.value || undefined })}
              className={inputClass}
            >
              <option value="">None</option>
              <option value="rgba(15,23,42,0.3)">Light</option>
              <option value="rgba(15,23,42,0.55)">Medium</option>
              <option value="rgba(15,23,42,0.75)">Heavy</option>
              <option value="linear-gradient">Fade at the bottom</option>
            </select>
          </Field>
        </>
      )}

      {layer.type === 'shape' && (
        <Field label="Colour">
          <input
            type="color"
            value={layer.content || '#000000'}
            onChange={(e) => onChange({ content: e.target.value })}
            className="h-8 w-full cursor-pointer rounded border border-slate-300"
          />
        </Field>
      )}

      <Field label={`Opacity ${Math.round((style.opacity ?? 1) * 100)}%`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={style.opacity ?? 1}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </Field>

      <Field label={`Rotation ${style.rotation ?? 0}°`}>
        <input
          type="range"
          min="-45"
          max="45"
          value={style.rotation ?? 0}
          onChange={(e) => setStyle({ rotation: Number(e.target.value) })}
          className="w-full"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Animation">
          <select
            value={layer.animation}
            onChange={(e) => onChange({ animation: e.target.value as ProjectLayer['animation'] })}
            className={inputClass}
          >
            {LAYER_ANIMATIONS.map((animation) => (
              <option key={animation.value} value={animation.value}>
                {animation.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Starts at ${layer.delaySeconds.toFixed(1)}s`}>
          <input
            type="range"
            min="0"
            max="4"
            step="0.1"
            value={layer.delaySeconds}
            onChange={(e) => onChange({ delaySeconds: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumberField label="X" value={layer.box.x} onChange={(x) => onChange({ box: { ...layer.box, x } })} />
        <NumberField label="Y" value={layer.box.y} onChange={(y) => onChange({ box: { ...layer.box, y } })} />
        <NumberField label="W" value={layer.box.w} onChange={(w) => onChange({ box: { ...layer.box, w } })} />
        <NumberField label="H" value={layer.box.h} onChange={(h) => onChange({ box: { ...layer.box, h } })} />
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs tabular-nums outline-none focus:border-brand-500"
      />
    </label>
  );
}
