/*
 * Post-login redirect safety. The `?next=` query param is validated against
 * an internal-paths allow-list (Plan §4.5) so a crafted URL like
 * `?next=https://evil.example/phish` cannot bounce an authenticated session
 * off-domain.
 */

const SAFE_PREFIXES = [
  '/dashboard',
  '/pos',
  '/catalog',
  '/inventory',
  '/purchasing',
  '/hr',
  '/payroll',
  '/accounting',
  '/crm',
  '/marketing',
  '/ai',
  '/admin',
];

const DEFAULT_NEXT = '/dashboard';

export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  // Must be a relative, single-leading-slash path. Reject protocol-relative
  // (`//example.com`), absolute URLs, and anything containing an `@` or
  // encoded newline.
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_NEXT;
  if (/[\r\n\t\s]/.test(raw)) return DEFAULT_NEXT;
  if (raw.includes('@')) return DEFAULT_NEXT;

  const path = raw.split('?')[0] ?? '';
  if (!SAFE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return DEFAULT_NEXT;
  }
  return raw;
}

export { DEFAULT_NEXT };
