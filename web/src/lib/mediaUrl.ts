/**
 * Build an absolute URL for same-origin API static paths (e.g. avatars) or pass through http(s) URLs.
 */
export function resolveMediaUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (pathOrUrl == null) return undefined;
  const s = pathOrUrl.trim();
  if (!s) return undefined;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!origin) return s.startsWith('/') ? s : `/${s}`;
  return s.startsWith('/') ? `${origin}${s}` : `${origin}/${s}`;
}

/** Append a cache-busting query so the browser reloads after same-path image replacement. */
export function withMediaCacheBust(url: string | undefined, bust: number): string | undefined {
  if (url == null || url === '') return undefined;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${bust}`;
}
