/** Category slug generation for create flows (mirrors catalog smart-SKU expectations). */

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const RANDOM_SLUG_RE = /^cat-[a-f0-9]{12}$/;

function randomCategorySlug(): string {
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toLowerCase();
  return `cat-${hex}`;
}

function slugifyLatinName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Build a backend-safe category slug from a display name. */
export function generateCategorySlug(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return randomCategorySlug();
  }
  if (ARABIC_SCRIPT_RE.test(trimmed)) {
    return randomCategorySlug();
  }
  const slug = slugifyLatinName(trimmed);
  return slug || randomCategorySlug();
}

export function isRandomCategorySlug(slug: string): boolean {
  return RANDOM_SLUG_RE.test(slug.trim());
}
