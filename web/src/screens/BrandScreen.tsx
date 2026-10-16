import { useEffect, useRef, useState } from 'react';
import { ApiError, api, uploadToCloudinary, type BrandKit, type MediaAsset } from '../lib/api';
import { FONT_CHOICES } from '../lib/renderProject';
import { Alert, Button, Card, Spinner } from '../components/ui';

/**
 * The brand kit.
 *
 * Set once, applied everywhere: Magic Design takes the logo, colours and
 * font; posters take the colour and contact line; the composer offers the
 * signature and the usual hashtags. The brief and caption placeholders
 * ({phone}, {website}, …) read from here too.
 */
export function BrandScreen() {
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [library, setLibrary] = useState<MediaAsset[] | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hashtagText, setHashtagText] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getBrand()
      .then((b) => {
        setBrand(b);
        setHashtagText(b.defaultHashtags.join(' '));
      })
      .catch(() => setError('Could not load your brand kit.'));
  }, []);

  function set<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setBrand((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function openLibrary() {
    setPickingLogo((v) => !v);
    if (library === null) {
      try {
        const { media } = await api.listMedia();
        setLibrary(media.filter((m) => m.kind === 'image'));
      } catch {
        setLibrary([]);
      }
    }
  }

  async function handleLogoFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const signature = await api.uploadSignature();
      const uploaded = await uploadToCloudinary(file, signature);
      const asset = await api.registerMedia({ kind: 'image', url: uploaded.url, width: uploaded.width, height: uploaded.height });
      setLibrary((prev) => [asset, ...(prev ?? [])]);
      set('logoUrl', asset.url);
      setPickingLogo(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the logo.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!brand) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateBrand({
        ...brand,
        defaultHashtags: hashtagText
          .split(/[\s,]+/)
          .map((t) => t.replace(/^#/, '').trim())
          .filter(Boolean),
      });
      setBrand(updated);
      setHashtagText(updated.defaultHashtags.join(' '));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (!brand) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> {error ?? 'Loading brand kit…'}
      </div>
    );
  }

  const input =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';
  const label = 'mb-1 block text-xs font-medium text-slate-700';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Brand kit</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Set once; Magic Design, posters and the composer use it automatically.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save brand kit'}
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-slate-900">Identity</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>Business name</span>
            <input value={brand.name} onChange={(e) => set('name', e.target.value)} className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Tagline</span>
            <input
              value={brand.tagline ?? ''}
              onChange={(e) => set('tagline', e.target.value)}
              placeholder="Learn. Create. Perform. Grow."
              className={input}
            />
          </label>

          <div className="sm:col-span-2">
            <span className={label}>Logo</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">No logo</span>
                )}
              </div>
              <Button variant="secondary" className="!py-1 !text-xs" onClick={() => void openLibrary()}>
                {pickingLogo ? 'Close' : 'Choose from library'}
              </Button>
              <Button variant="secondary" className="!py-1 !text-xs" onClick={() => logoInput.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
              {brand.logoUrl && (
                <button onClick={() => set('logoUrl', null)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoFile(file);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">A PNG with a transparent background looks best over photos.</p>
            {pickingLogo && (
              <div className="mt-2 rounded-lg border border-slate-200 p-2">
                {library === null ? (
                  <Spinner className="h-4 w-4 text-slate-400" />
                ) : library.length === 0 ? (
                  <p className="text-xs text-slate-500">No images in your library yet.</p>
                ) : (
                  <ul className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                    {library.slice(0, 24).map((asset) => (
                      <li key={asset.id}>
                        <button
                          onClick={() => {
                            set('logoUrl', asset.url);
                            setPickingLogo(false);
                          }}
                          className={`block w-full overflow-hidden rounded border-2 ${
                            brand.logoUrl === asset.url ? 'border-brand-500' : 'border-transparent hover:border-slate-300'
                          }`}
                        >
                          <img src={asset.thumbnailUrl ?? asset.url} alt="" className="aspect-square w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <label className="block">
            <span className={label}>Main colour</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.primaryColor ?? '#4f46e5'}
                onChange={(e) => set('primaryColor', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-slate-300"
              />
              <input
                value={brand.primaryColor ?? ''}
                onChange={(e) => set('primaryColor', e.target.value)}
                placeholder="#4f46e5"
                className={input}
              />
            </div>
          </label>
          <label className="block">
            <span className={label}>Second colour</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.secondaryColor ?? '#0f172a'}
                onChange={(e) => set('secondaryColor', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-slate-300"
              />
              <input
                value={brand.secondaryColor ?? ''}
                onChange={(e) => set('secondaryColor', e.target.value)}
                placeholder="#0f172a"
                className={input}
              />
            </div>
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Font</span>
            <select value={brand.fontFamily ?? ''} onChange={(e) => set('fontFamily', e.target.value || null)} className={input}>
              <option value="">Default (Modern sans)</option>
              {FONT_CHOICES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-slate-900">Contact details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Phone</span>
            <input value={brand.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="95668 66588" className={input} />
          </label>
          <label className="block">
            <span className={label}>Website</span>
            <input value={brand.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="www.nadanaloga.com" className={input} />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input value={brand.email ?? ''} onChange={(e) => set('email', e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className={label}>Address</span>
            <input value={brand.address ?? ''} onChange={(e) => set('address', e.target.value)} className={input} />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          In any brief or caption, <strong>{'{phone}'}</strong>, <strong>{'{website}'}</strong>,{' '}
          <strong>{'{email}'}</strong>, <strong>{'{address}'}</strong>, <strong>{'{name}'}</strong> and{' '}
          <strong>{'{tagline}'}</strong> are replaced with these.
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-slate-900">Captions</h3>
        <label className="block">
          <span className={label}>Signature — added to a caption with one click</span>
          <textarea
            value={brand.signature ?? ''}
            onChange={(e) => set('signature', e.target.value)}
            rows={2}
            placeholder={'📞 95668 66588 · www.nadanaloga.com'}
            className={input}
          />
        </label>
        <label className="mt-3 block">
          <span className={label}>Hashtags you always use</span>
          <input
            value={hashtagText}
            onChange={(e) => setHashtagText(e.target.value)}
            placeholder="nadanaloga chennai bharatanatyam"
            className={input}
          />
        </label>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-slate-900">About the business</h3>
        <p className="mb-2 text-xs text-slate-500">Used when AI caption help is switched on; otherwise just a reminder for the team.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Industry</span>
            <input value={brand.industry ?? ''} onChange={(e) => set('industry', e.target.value)} placeholder="Fine arts academy" className={input} />
          </label>
          <label className="block">
            <span className={label}>Audience</span>
            <input value={brand.targetAudience ?? ''} onChange={(e) => set('targetAudience', e.target.value)} placeholder="Parents of children 5–15 in south Chennai" className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Tone of voice</span>
            <input value={brand.toneOfVoice ?? ''} onChange={(e) => set('toneOfVoice', e.target.value)} placeholder="Warm, encouraging, proud of our students" className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Description</span>
            <textarea value={brand.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} className={input} />
          </label>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save brand kit'}
        </Button>
      </div>
    </div>
  );
}
