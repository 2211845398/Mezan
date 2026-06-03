import { describe, expect, it } from 'vitest';

import { DEFAULT_NEXT, sanitizeNextPath } from './nextPath';

describe('sanitizeNextPath', () => {
  it('defaults to role-aware home', () => {
    expect(DEFAULT_NEXT).toBe('/');
  });
  it('accepts known internal paths', () => {
    expect(sanitizeNextPath('/')).toBe('/');
    expect(sanitizeNextPath('/dashboard')).toBe('/dashboard');
    expect(sanitizeNextPath('/notifications')).toBe('/notifications');
    expect(sanitizeNextPath('/notifications?tab=unread')).toBe('/notifications?tab=unread');
    expect(sanitizeNextPath('/admin/users')).toBe('/admin/users');
    expect(sanitizeNextPath('/accounting/trial-balance?period=2026-01')).toBe(
      '/accounting/trial-balance?period=2026-01',
    );
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(sanitizeNextPath('//evil.example/phish')).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath('https://evil.example/phish')).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath('javascript:alert(1)')).toBe(DEFAULT_NEXT);
  });

  it('rejects unknown first-segment paths', () => {
    expect(sanitizeNextPath('/wat')).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath('/../etc/passwd')).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath('')).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath(null)).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_NEXT);
  });

  it('rejects strings that contain whitespace or @', () => {
    expect(sanitizeNextPath('/dashboard@evil.example')).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath('/dashboard\n')).toBe(DEFAULT_NEXT);
  });
});
