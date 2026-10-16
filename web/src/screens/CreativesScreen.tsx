import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ASPECT_RATIOS,
  BUILT_IN_TEMPLATES,
  findMissingFields,
  type AspectRatioKey,
  type CreativeSpec,
  type TemplateDefinition,
  type TemplateField,
} from '@socialboost/shared';
import { ApiError, api, getFeatures, uploadToCloudinary, type MediaAsset } from '../lib/api';
import { Spinner as LoadingDots } from '../components/ui';
import { renderToBlob, renderToDataUrl } from '../lib/renderTemplate';
import { Alert, Button, Card, Spinner } from '../components/ui';

/**
 * Creative studio.
 *
 * A short form over a fixed layout, not a freeform canvas. That is both the
 * lightest thing to build and the easiest thing to use: a shop owner filling
 * in six words gets a usable ad, where a blank canvas would get them nowhere.
 */
export function CreativesScreen({ openDesignId }: { openDesignId?: string }) {
  const [template, setTemplate] = useState<TemplateDefinition | null>(null);
  const [saved, setSaved] = useState<{
    id: string;
    values: Record<string, string>;
    ratio: AspectRatioKey;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(openDesignId));
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reopening a saved poster restores its template, values and size.
  useEffect(() => {
    if (!openDesignId) return;
    setLoading(true);
    api
      .getDesign(openDesignId)
      .then((design) => {
        const document = design.document as {
          templateSlug?: string;
          values?: Record<string, string>;
          ratio?: AspectRatioKey;
        };
        const found = BUILT_IN_TEMPLATES.find((t) => t.slug === document.templateSlug);
        if (!found) throw new Error('template missing');
        setTemplate(found);
        setSaved({
          id: design.id,
          values: document.values ?? {},
          ratio: document.ratio ?? found.ratios[0] ?? 'square',
          name: design.name,
        });
      })
      .catch(() => setLoadError('Could not open that design.'))
      .finally(() => setLoading(false));
  }, [openDesignId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <LoadingDots /> Opening…
      </div>
    );
  }
  if (loadError) return <Alert>{loadError}</Alert>;

  if (!template) {
    return (
      <TemplatePicker
        onPick={(picked) => {
          setSaved(null);
          setTemplate(picked);
        }}
      />
    );
  }
  return (
    <TemplateEditor
      key={saved?.id ?? template.slug}
      template={template}
      saved={saved}
      onBack={() => {
        setTemplate(null);
        setSaved(null);
      }}
    />
  );
}

function TemplatePicker({ onPick }: { onPick: (template: TemplateDefinition) => void }) {
  const categories = useMemo(() => {
    const grouped = new Map<string, TemplateDefinition[]>();
    for (const template of BUILT_IN_TEMPLATES) {
      grouped.set(template.category, [...(grouped.get(template.category) ?? []), template]);
    }
    return [...grouped.entries()];
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Create an ad</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Pick a layout, fill in a few words, and get a finished image in every size you need.
        </p>
      </div>

      {categories.map(([category, templates]) => (
        <section key={category}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            {category}
          </h3>
          <ul className="grid grid-cols-2 gap-3">
            {templates.map((template) => (
              <li key={template.slug}>
                <button
                  onClick={() => onPick(template)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-400 hover:shadow"
                >
                  <TemplateThumbnail template={template} />
                  <p className="mt-3 font-medium text-slate-900">{template.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {template.fields.filter((f) => f.required).length} fields ·{' '}
                    {template.ratios.length} sizes
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Renders the template with its own defaults, so the picker shows real output. */
function TemplateThumbnail({ template }: { template: TemplateDefinition }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ratio = template.ratios[0] ?? 'square';
    renderToDataUrl({ template, values: {}, ratio })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [template]);

  return (
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-100">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Spinner className="h-5 w-5 text-slate-400" />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  saved,
  onBack,
}: {
  template: TemplateDefinition;
  saved?: { id: string; values: Record<string, string>; ratio: AspectRatioKey; name: string } | null;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () =>
      saved?.values ??
      Object.fromEntries(
        template.fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue!]),
      ),
  );
  const [ratio, setRatio] = useState<AspectRatioKey>(
    saved?.ratio ?? template.ratios[0] ?? 'square',
  );
  const [designId, setDesignId] = useState<string | null>(saved?.id ?? null);
  const [name, setName] = useState(saved?.name ?? template.name);
  const [shortDescription, setShortDescription] = useState('');
  const [tagText, setTagText] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  // Offering a button that always fails is worse than not offering it.
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    void getFeatures().then((features) => setAiAvailable(features.ai));
  }, []);

  // A new poster starts with the brand kit's colour and contact line, where
  // the template has those fields and the user has not typed anything yet.
  useEffect(() => {
    if (saved) return;
    api
      .getBrand()
      .then((brand) => {
        const fill: Record<string, string> = {};
        const keys = new Set(template.fields.map((f) => f.key));
        if (keys.has('brandColor') && brand.primaryColor) fill.brandColor = brand.primaryColor;
        const contact = [brand.phone, brand.website].filter(Boolean).join(' · ');
        if (keys.has('contact') && contact) fill.contact = contact;
        if (Object.keys(fill).length === 0) return;
        setValues((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(fill)) {
            const field = template.fields.find((f) => f.key === key);
            if (!prev[key] || prev[key] === field?.defaultValue) next[key] = value;
          }
          return next;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.slug]);

  const spec: CreativeSpec = useMemo(() => ({ template, values, ratio }), [template, values, ratio]);
  const missing = findMissingFields(spec);

  // Re-render on every change; a full-size canvas draw is a few milliseconds.
  useEffect(() => {
    let cancelled = false;
    renderToDataUrl(spec)
      .then((url) => !cancelled && setPreview(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [spec]);

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleImageField(key: string, file: File) {
    setUploadingField(key);
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      setValue(key, uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setUploadingField(null);
    }
  }

  async function handleAutofill() {
    if (!brief.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const filled = await api.autofillTemplate(template.slug, brief.trim());
      setValues((prev) => ({ ...prev, ...filled.values }));
      setNotice('Filled in from your brief. Edit anything that is not quite right.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the wording.');
    } finally {
      setBusy(false);
    }
  }

  /** Saves the rendered image to the media library so a post can use it. */
  /** Saves the editable design, so it can be reopened and changed later. */
  async function handleSaveDesign(renderedAssetId?: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveDesign({
        id: designId ?? undefined,
        name: name || template.name,
        kind: 'image',
        ratio,
        document: { templateSlug: template.slug, values, ratio },
        shortDescription: shortDescription || undefined,
        tags: tagText
          .split(/[,\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        renderedAssetId,
      });
      setDesignId(result.id);
      setNotice('Saved. Find it again under My designs.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this design.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveToLibrary() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await renderToBlob(spec);
      const file = new File([blob], `${template.slug}-${ratio}.png`, { type: 'image/png' });
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      const asset: MediaAsset = await api.registerMedia({
        kind: 'image',
        url: uploaded.url,
        width: uploaded.width,
        height: uploaded.height,
        bytes: blob.size,
        providerRef: uploaded.publicId,
      });
      setNotice(`Saved. Pick it in Compose to publish. (${asset.width}×${asset.height})`);
      // Keeps the My designs thumbnail in step with the latest render.
      void handleSaveDesign(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the image.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    const blob = await renderToBlob(spec);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.slug}-${ratio}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← Templates
        </Button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
        />
        <Button variant="secondary" onClick={() => void handleSaveDesign()} disabled={saving}>
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

      <div className="flex flex-col-reverse gap-5 lg:grid lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {aiAvailable && (
          <Card>
            <h3 className="mb-2 text-sm font-medium text-slate-900">Write it for me</h3>
            <div className="flex gap-2">
              <input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Diwali discount on weekend dance classes"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <Button onClick={() => void handleAutofill()} disabled={busy || !brief.trim()}>
                {busy ? '…' : 'Generate'}
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Describe the ad in a sentence and the wording is filled in for you.
            </p>
          </Card>
          )}

          <Card>
            <div className="space-y-3">
              {template.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ''}
                  uploading={uploadingField === field.key}
                  onChange={(value) => setValue(field.key, value)}
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
        </div>

        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {template.ratios.map((key) => (
                <button
                  key={key}
                  onClick={() => setRatio(key)}
                  className={`rounded-lg px-2 py-1 text-xs transition ${
                    ratio === key
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ASPECT_RATIOS[key].label}
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-lg bg-slate-100">
              {preview ? (
                <img src={preview} alt="Preview of your ad" className="w-full" />
              ) : (
                <div className="flex aspect-square items-center justify-center">
                  <Spinner className="h-5 w-5 text-slate-400" />
                </div>
              )}
            </div>
          </Card>

          {missing.length > 0 && (
            <Alert tone="warning">
              Still needed: {missing.map((f) => f.label).join(', ')}
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Button onClick={() => void handleSaveToLibrary()} disabled={busy || missing.length > 0}>
              {busy ? 'Working…' : 'Save to library'}
            </Button>
            <Button variant="secondary" onClick={() => void handleDownload()} disabled={busy}>
              Download PNG
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
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
  const label = (
    <span className="mb-1 flex items-baseline justify-between">
      <span className="text-sm font-medium text-slate-700">
        {field.label}
        {!field.required && <span className="ml-1 text-xs text-slate-400">optional</span>}
      </span>
      {field.maxLength && (
        <span
          className={`text-xs ${
            value.length > field.maxLength ? 'text-red-600' : 'text-slate-400'
          }`}
        >
          {value.length}/{field.maxLength}
        </span>
      )}
    </span>
  );

  if (field.type === 'image') {
    return (
      <label className="block">
        {label}
        <div className="flex items-center gap-2">
          {value && <img src={value} alt="" className="h-10 w-10 rounded object-cover" />}
          <Button variant="secondary" onClick={onPickFile} disabled={uploading}>
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Choose photo'}
          </Button>
          {value && (
            <button
              onClick={() => onChange('')}
              className="text-xs text-slate-500 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      </label>
    );
  }

  if (field.type === 'color') {
    return (
      <label className="block">
        {label}
        <input
          type="color"
          value={value || field.defaultValue || '#4f46e5'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-16 cursor-pointer rounded border border-slate-300"
        />
      </label>
    );
  }

  const shared =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

  return (
    <label className="block">
      {label}
      {field.type === 'longtext' ? (
        <textarea
          value={value}
          rows={3}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} resize-y`}
        />
      ) : (
        <input
          value={value}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      )}
    </label>
  );
}
