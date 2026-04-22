import { describe, expect, it } from 'vitest';

import { formatNumber } from '@/lib/format';

describe('format', () => {
  it('formatNumber uses Western digits (ASCII U+0030–U+0039), never Eastern Arabic (U+0660–U+0669)', () => {
    const s = formatNumber(1234.5);
    expect(s).toContain('1');
    expect(s.charCodeAt(s.indexOf('1'))).toBe(0x31);
    expect(s).not.toContain('\u0661');
    expect(s).not.toMatch(/[\u0660-\u0669]/);
  });
});
