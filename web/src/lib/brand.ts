import type { BrandKit } from './api';

/**
 * Fills {name}, {phone}, {website}, {email}, {address}, {tagline} in a brief
 * or caption from the brand kit, so a template written once works for every
 * business that uses it.
 */
export function applyBrandPlaceholders(text: string, brand: BrandKit | null): string {
  if (!brand) return text;
  const values: Record<string, string> = {
    name: brand.name,
    phone: brand.phone ?? '',
    website: brand.website ?? '',
    email: brand.email ?? '',
    address: brand.address ?? '',
    tagline: brand.tagline ?? '',
  };
  return text.replace(/\{(name|phone|website|email|address|tagline)\}/gi, (_, key: string) =>
    values[key.toLowerCase()] ?? '',
  );
}

/** A footer line for Magic Design, from whatever contact details exist. */
export function brandFooter(brand: BrandKit | null): string {
  if (!brand) return '';
  return [brand.website, brand.phone].filter(Boolean).join(' · ');
}
